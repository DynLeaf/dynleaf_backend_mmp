import mongoose from 'mongoose';
import { Brand } from '../../models/Brand.js';
import { User } from '../../models/User.js';
import { Outlet } from '../../models/Outlet.js';
import { Menu } from '../../models/Menu.js';
import { BrandUpdateRequest } from '../../models/BrandUpdateRequest.js';

export const findBrands = async (query: Record<string, unknown>, skip: number, limit: number) => {
    const [brands, total] = await Promise.all([
        Brand.find(query)
            .populate('admin_user_id', 'phone email username')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Brand.countDocuments(query),
    ]);
    return { brands, total };
};

export const findBrandById = async (id: string) => {
    return await Brand.findById(id)
        .populate('admin_user_id', 'phone email username full_name')
        .populate('verified_by', 'email')
        .lean();
};

export const findOutletsByBrand = async (brandId: string) => {
    return await Outlet.find({ brand_id: brandId })
        .select('name slug status approval_status address contact media')
        .lean();
};

export const findMenusByBrand = async (brandId: string) => {
    return await Menu.find({ brand_id: brandId })
        .select('name slug is_active is_default categories')
        .lean();
};

export const updateBrandOwner = async (brandId: string, newOwnerId: string, previousOwnerId?: string, reviewerId?: string) => {
    const brand = await Brand.findById(brandId);
    if (!brand) return null;

    brand.admin_user_id = new mongoose.Types.ObjectId(newOwnerId) as any;
    await brand.save();

    if (previousOwnerId) {
        await User.findByIdAndUpdate(previousOwnerId, {
            $pull: {
                roles: {
                    scope: 'brand',
                    role: 'restaurant_owner',
                    brandId: new mongoose.Types.ObjectId(brandId)
                }
            }
        });
    }

    const newOwner = await User.findById(newOwnerId);
    if (newOwner) {
        const hasRole = newOwner.roles.some(
            (r: any) => r.scope === 'brand' && r.role === 'restaurant_owner' && r.brandId?.toString() === brandId
        );
        if (!hasRole) {
            await User.findByIdAndUpdate(newOwnerId, {
                $push: {
                    roles: {
                        scope: 'brand',
                        role: 'restaurant_owner',
                        brandId: new mongoose.Types.ObjectId(brandId),
                        assignedAt: new Date(),
                        assignedBy: reviewerId ? new mongoose.Types.ObjectId(reviewerId) : undefined
                    }
                }
            });
        }
    }

    return await Brand.findById(brandId).populate('admin_user_id', 'name email phone full_name username').lean();
};

export const updateBrandVerificationStatus = async (id: string, status: string, reason?: string) => {
    const updatePayload: any = {
        verification_status: status,
        verified_at: new Date(),
    };
    if (reason) updatePayload.rejection_reason = reason;

    return await Brand.findByIdAndUpdate(id, updatePayload, { new: true }).lean();
};

export const findBrandUpdateRequests = async (query: Record<string, unknown>, skip: number, limit: number) => {
    const [requests, total] = await Promise.all([
        BrandUpdateRequest.find(query)
            .populate('brand_id', 'name logo_url')
            .populate('requested_by', 'name email phone username')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        BrandUpdateRequest.countDocuments(query),
    ]);
    return { requests, total };
};

export const findBrandUpdateRequestById = async (id: string) => {
    return await BrandUpdateRequest.findById(id)
        .populate('brand_id', 'name logo_url description cuisines')
        .populate('requested_by', 'name email phone username')
        .lean();
};

export const processBrandUpdateRequest = async (id: string, status: string, parsedUpdates?: any, reason?: string) => {
    const updatePayload: any = {
        status,
        reviewed_at: new Date()
    };
    if (reason) updatePayload.rejection_reason = reason;

    const request = await BrandUpdateRequest.findByIdAndUpdate(id, updatePayload, { new: true });
    
    if (status === 'approved' && request && parsedUpdates) {
        await Brand.findByIdAndUpdate(request.brand_id, {
            $set: parsedUpdates,
            verification_status: 'approved'
        });
    }

    return request;
};

export const checkUserExists = async (userId: string) => {
    return await User.exists({ _id: userId });
};
