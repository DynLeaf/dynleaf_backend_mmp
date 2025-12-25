import { Outlet, IOutlet } from '../models/Outlet.js';
import { OperatingHours } from '../models/OperatingHours.js';
import { Compliance } from '../models/Compliance.js';
import mongoose from 'mongoose';

/**
 * Get all outlets for a user
 */
export const getUserOutlets = async (userId: string): Promise<IOutlet[]> => {
    return await Outlet.find({ created_by_user_id: userId })
        .populate('brand_id')
        .sort({ created_at: -1 });
};

/**
 * Get outlet by ID
 */
export const getOutletById = async (outletId: string): Promise<IOutlet | null> => {
    return await Outlet.findById(outletId).populate('brand_id');
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
        if (updateData[key as keyof IOutlet] !== undefined) {
            (outlet as any)[key] = updateData[key as keyof IOutlet];
        }
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
