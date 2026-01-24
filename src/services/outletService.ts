import { Outlet, IOutlet } from '../models/Outlet.js';
import { OperatingHours } from '../models/OperatingHours.js';
import { Compliance } from '../models/Compliance.js';
import { User } from '../models/User.js';
import mongoose from 'mongoose';
import { ensureSubscriptionForOutlet } from '../utils/subscriptionUtils.js';
import { Subscription } from '../models/Subscription.js';
import { normalizePlanToTier } from '../config/subscriptionPlans.js';

const toObjectId = (value: unknown): mongoose.Types.ObjectId | null => {
    if (!value) return null;
    if (value instanceof mongoose.Types.ObjectId) return value;
    if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);
    return null;
};

const getAccessibleOutletQueryForUser = async (userId: string) => {
    const user = await User.findById(userId).select('roles').lean();
    if (!user) {
        return { created_by_user_id: userId };
    }

    const isAdmin = (user as any).roles?.some((r: any) => r?.role === 'admin');
    if (isAdmin) {
        return {};
    }

    const outletIds = ((user as any).roles || [])
        .filter((r: any) => r?.scope === 'outlet' && r?.outletId)
        .map((r: any) => toObjectId(r.outletId))
        .filter(Boolean) as mongoose.Types.ObjectId[];

    const brandIds = ((user as any).roles || [])
        .filter((r: any) => r?.scope === 'brand' && r?.brandId)
        .map((r: any) => toObjectId(r.brandId))
        .filter(Boolean) as mongoose.Types.ObjectId[];

    return {
        $or: [
            { created_by_user_id: userId },
            ...(outletIds.length ? [{ _id: { $in: outletIds } }] : []),
            ...(brandIds.length ? [{ brand_id: { $in: brandIds } }] : []),
        ],
    };
};

/**
 * Get all outlets for a user (full details)
 */
export const getUserOutlets = async (userId: string): Promise<IOutlet[]> => {
    // Security/UX: "My outlets" should only include outlets created by this user.
    // (Do not expand via brand/outlet roles here.)
    return await Outlet.find({ created_by_user_id: userId })
        .populate('brand_id')
        .sort({ created_at: -1 });
};

/**
 * Get outlet list for dropdown (lightweight - only essential fields)
 */
export const getUserOutletsList = async (userId: string) => {
    // Security/UX: dropdown should only list outlets created by this user.
    // (Do not expand via brand/outlet roles here.)
    const outlets = await Outlet.find({ created_by_user_id: userId })
        .select('_id name brand_id status approval_status media.cover_image_url address.city')
        .populate('brand_id', 'name')
        .sort({ created_at: -1 })
        .lean();

    // Fetch subscription tier for each outlet to help frontend defaulting
    const outletsWithTier = await Promise.all(outlets.map(async (outlet) => {
        const sub = await Subscription.findOne({ outlet_id: outlet._id })
            .select('plan status')
            .lean();

        return {
            ...outlet,
            subscription_tier: sub ? normalizePlanToTier(sub.plan) : 'free'
        };
    }));

    return outletsWithTier;
};

/**
 * Get outlet by ID or Slug
 */
export const getOutletById = async (idOrSlug: string): Promise<IOutlet | null> => {
    console.log(`[getOutletById] Resolving: ${idOrSlug}`);
    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
        console.log(`[getOutletById] Valid ObjectId detected`);
        return await Outlet.findById(idOrSlug).populate('brand_id');
    }
    console.log(`[getOutletById] Not a valid ObjectId, searching by slug`);
    const outlet = await Outlet.findOne({ slug: idOrSlug }).populate('brand_id');
    console.log(`[getOutletById] Resolved to ID: ${outlet?._id || 'NULL'}`);
    return outlet;
};

/**
 * Create a new outlet
 */
export const createOutlet = async (userId: string, brandId: string, outletData: {
    name: string;
    contact?: {
        phone?: string;
        email?: string;
    };
    address?: {
        full?: string;
        city?: string;
        state?: string;
        country?: string;
        pincode?: string;
    };
    location?: {
        type?: string;
        coordinates: number[];
    };
    media?: {
        cover_image_url?: string;
    };
    restaurant_type?: string;
    vendor_types?: string[];
    seating_capacity?: number;
    table_count?: number;
    social_media?: {
        instagram?: string;
        facebook?: string;
        twitter?: string;
    };
}): Promise<IOutlet> => {
    // Generate slug from name
    const slug = outletData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Log location data for debugging
    console.log('🗺️  Creating outlet with location:', JSON.stringify(outletData.location, null, 2));

    const outlet = new Outlet({
        brand_id: brandId,
        created_by_user_id: userId,
        name: outletData.name,
        slug,
        status: 'DRAFT',
        approval_status: 'PENDING',
        contact: outletData.contact,
        address: outletData.address,
        location: outletData.location ? {
            type: 'Point',
            coordinates: outletData.location.coordinates
        } : undefined,
        media: outletData.media,
        restaurant_type: outletData.restaurant_type,
        vendor_types: outletData.vendor_types,
        seating_capacity: outletData.seating_capacity,
        table_count: outletData.table_count,
        social_media: outletData.social_media,
        flags: {
            is_featured: false,
            is_trending: false
        }
    });

    await outlet.save();
    console.log('✅ Outlet saved successfully');
    console.log('   Name:', outlet.name);
    console.log('   Location:', JSON.stringify(outlet.location, null, 2));
    console.log('   Coordinates:', outlet.location?.coordinates);

    // Assign outlet-level restaurant_owner role to the user
    const User = (await import('../models/User.js')).User;
    const user = await User.findById(userId);
    if (user) {
        const hasOutletRole = user.roles.some(r =>
            r.scope === 'outlet' &&
            r.role === 'restaurant_owner' &&
            r.outletId?.toString() === outlet._id.toString()
        );

        if (!hasOutletRole) {
            user.roles.push({
                scope: 'outlet',
                role: 'restaurant_owner',
                outletId: outlet._id as mongoose.Types.ObjectId,
                brandId: brandId as unknown as mongoose.Types.ObjectId,
                permissions: [],
                assignedAt: new Date(),
                assignedBy: userId as unknown as mongoose.Types.ObjectId
            } as any);
            await user.save();
            console.log('✅ Assigned outlet-level role to user:', userId, 'for outlet:', outlet._id);
        }
    }

    // Ensure the outlet has a default subscription (free + active)
    await ensureSubscriptionForOutlet(outlet._id.toString(), {
        plan: 'free',
        status: 'active',
        assigned_by: userId,
        notes: 'Auto-created on outlet creation'
    });

    return outlet;
};

/**
 * Update outlet
 */
export const updateOutlet = async (
    outletId: string,
    userId: string,
    updateData: Partial<IOutlet>
): Promise<IOutlet | null> => {
    const outlet = await Outlet.findOne({ _id: outletId, created_by_user_id: userId });

    if (!outlet) {
        throw new Error('Outlet not found or unauthorized');
    }

    // Update allowed fields
    Object.keys(updateData).forEach(key => {
        const value = updateData[key as keyof IOutlet];
        if (value === undefined) return;

        // Merge nested media updates to avoid overwriting other media fields
        if (key === 'media' && value && typeof value === 'object') {
            (outlet as any).media = { ...((outlet as any).media || {}), ...(value as any) };
            return;
        }

        (outlet as any)[key] = value;
    });

    await outlet.save();
    return outlet;
};

/**
 * Submit outlet for approval
 */
export const submitOutletForApproval = async (outletId: string, userId: string): Promise<IOutlet | null> => {
    const outlet = await Outlet.findOne({ _id: outletId, created_by_user_id: userId });

    if (!outlet) {
        throw new Error('Outlet not found or unauthorized');
    }

    outlet.approval_status = 'PENDING';
    outlet.approval = {
        submitted_at: new Date()
    };

    await outlet.save();
    return outlet;
};

/**
 * Get outlets by brand
 */
export const getOutletsByBrand = async (brandId: string): Promise<IOutlet[]> => {
    return await Outlet.find({ brand_id: brandId, status: { $ne: 'ARCHIVED' } });
};
