import mongoose from 'mongoose';
import * as outletRepo from '../repositories/outletRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import type { IOutlet } from '../models/Outlet.js';
import { ensureSubscriptionForOutlet } from '../utils/subscriptionUtils.js';
import { normalizePlanToTier } from '../config/subscriptionPlans.js';

interface OutletRole {
    scope: string;
    role: string;
    outletId?: mongoose.Types.ObjectId;
    brandId?: mongoose.Types.ObjectId;
    permissions?: string[];
    assignedAt?: Date;
    assignedBy?: mongoose.Types.ObjectId;
}

const toObjectId = (value: unknown): mongoose.Types.ObjectId | null => {
    if (!value) return null;
    if (value instanceof mongoose.Types.ObjectId) return value;
    if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);
    return null;
};

const getAccessibleOutletQuery = async (userId: string): Promise<object> => {
    const user = await outletRepo.findUserRoles(userId) as { roles?: OutletRole[] } | null;
    if (!user) return { created_by_user_id: userId };

    const roles: OutletRole[] = (user as { roles?: OutletRole[] }).roles ?? [];
    const isAdmin = roles.some(r => r?.role === 'admin');
    if (isAdmin) return {};

    const outletIds = roles
        .filter(r => r?.scope === 'outlet' && r?.outletId)
        .map(r => toObjectId(r.outletId))
        .filter(Boolean) as mongoose.Types.ObjectId[];

    const brandIds = roles
        .filter(r => r?.scope === 'brand' && r?.brandId)
        .map(r => toObjectId(r.brandId))
        .filter(Boolean) as mongoose.Types.ObjectId[];

    return {
        $or: [
            { created_by_user_id: userId },
            ...(outletIds.length ? [{ _id: { $in: outletIds } }] : []),
            ...(brandIds.length ? [{ brand_id: { $in: brandIds } }] : []),
        ],
    };
};

export const getUserOutlets = async (userId: string): Promise<IOutlet[]> => {
    const query = await getAccessibleOutletQuery(userId);
    return outletRepo.findWithQuery(query) as unknown as IOutlet[];
};

export const getUserOutletsList = async (userId: string) => {
    const query = await getAccessibleOutletQuery(userId);
    const outlets = await outletRepo.findWithQuerySelect(query) as Array<IOutlet & { _id: mongoose.Types.ObjectId }>;

    const outletsWithTier = await Promise.all(outlets.map(async outlet => {
        const sub = await outletRepo.findSubscriptionByOutletId(outlet._id) as { plan?: string; status?: string } | null;
        return {
            ...outlet,
            subscription_tier: sub ? normalizePlanToTier(sub.plan ?? 'free') : 'free'
        };
    }));

    return outletsWithTier;
};

export const getOutletById = async (idOrSlug: string): Promise<IOutlet | null> =>
    outletRepo.findByIdWithPopulate(idOrSlug) as unknown as IOutlet | null;

export const createOutlet = async (userId: string, brandId: string, outletData: {
    name: string;
    contact?: { phone?: string; email?: string };
    address?: { full?: string; city?: string; state?: string; country?: string; pincode?: string };
    location?: { type?: string; coordinates: number[] };
    media?: { cover_image_url?: string };
    restaurant_type?: string;
    vendor_types?: string[];
    seating_capacity?: number;
    table_count?: number;
    social_media?: { instagram?: string; facebook?: string; twitter?: string };
    referral_code?: string;
}): Promise<IOutlet> => {
    const slug = outletData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const outlet = await outletRepo.create({
        brand_id: new mongoose.Types.ObjectId(brandId),
        created_by_user_id: new mongoose.Types.ObjectId(userId),
        name: outletData.name,
        slug,
        status: 'DRAFT',
        approval_status: 'PENDING',
        contact: outletData.contact,
        address: outletData.address,
        location: outletData.location ? { type: 'Point', coordinates: outletData.location.coordinates as [number, number] } : undefined,
        media: outletData.media,
        restaurant_type: outletData.restaurant_type,
        vendor_types: outletData.vendor_types,
        seating_capacity: outletData.seating_capacity,
        table_count: outletData.table_count,
        social_media: outletData.social_media,
        referral_code: outletData.referral_code,
        flags: { is_featured: false, is_trending: false, accepts_online_orders: true, is_open_now: true }
    }) as unknown as IOutlet;

    // Assign outlet-level restaurant_owner role to the user
    const user = await outletRepo.findUserByIdForRole(userId) as {
        roles: OutletRole[];
        save: () => Promise<void>;
    } | null;
    if (user) {
        const outletId = (outlet as unknown as { _id: mongoose.Types.ObjectId })._id;
        const hasOutletRole = user.roles.some(r =>
            r.scope === 'outlet' &&
            r.role === 'restaurant_owner' &&
            r.outletId?.toString() === outletId.toString()
        );
        if (!hasOutletRole) {
            await userRepository.addOutletRole(userId, {
                scope: 'outlet',
                role: 'restaurant_owner',
                outletId,
                brandId: new mongoose.Types.ObjectId(brandId),
                permissions: [],
                assignedAt: new Date(),
                assignedBy: new mongoose.Types.ObjectId(userId)
            });
        }
    }

    const outletId = (outlet as unknown as { _id: { toString(): string } })._id;
    await ensureSubscriptionForOutlet(outletId.toString(), {
        plan: 'free',
        status: 'active',
        assigned_by: userId,
        notes: 'Auto-created on outlet creation'
    });

    return outlet;
};

export const updateOutlet = async (outletId: string, userId: string, updateData: Partial<IOutlet>): Promise<IOutlet | null> => {
    const accessQuery = await getAccessibleOutletQuery(userId);
    return outletRepo.findAndUpdateOutlet({ $and: [{ _id: outletId }, accessQuery] }, updateData);
};

export const submitOutletForApproval = async (outletId: string, userId: string): Promise<IOutlet | null> => {
    const accessQuery = await getAccessibleOutletQuery(userId);
    return outletRepo.findAndUpdateOutlet({ $and: [{ _id: outletId }, accessQuery] }, {
        approval_status: 'PENDING',
        approval: { submitted_at: new Date() }
    } as Partial<IOutlet>);
};

export const getOutletsByBrand = (brandId: string) => outletRepo.findByBrandIdAll(brandId);
