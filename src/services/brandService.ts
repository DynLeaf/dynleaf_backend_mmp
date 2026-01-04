import { Brand, IBrand } from '../models/Brand.js';
import { User } from '../models/User.js';
import { BrandUpdateRequest } from '../models/BrandUpdateRequest.js';
import mongoose from 'mongoose';

/**
 * Get all brands for a user
 */
export const getUserBrands = async (userId: string): Promise<IBrand[]> => {
    return await Brand.find({ admin_user_id: userId });
};

/**
 * Get brand by ID
 */
export const getBrandById = async (brandId: string): Promise<IBrand | null> => {
    return await Brand.findById(brandId);
};

/**
 * Create a new brand
 */
export const createBrand = async (userId: string, brandData: {
    name: string;
    description?: string;
    logo_url?: string;
    cuisines: string[];
    operating_modes: {
        corporate: boolean;
        franchise: boolean;
    };
    social_media?: {
        instagram?: string;
        website?: string;
    };
}): Promise<IBrand> => {
    // Check if brand with same name already exists globally (across all users)
    const existingBrandByName = await Brand.findOne({
        name: { $regex: new RegExp(`^${brandData.name}$`, 'i') },
        verification_status: 'approved'
    });

    if (existingBrandByName) {
        throw new Error(`A brand named "${brandData.name}" already exists. Please choose a different name.`);
    }

    // Check if user already has a pending brand with the same name
    const existingPendingBrand = await Brand.findOne({
        name: { $regex: new RegExp(`^${brandData.name}$`, 'i') },
        admin_user_id: userId,
        verification_status: 'pending'
    });

    if (existingPendingBrand) {
        throw new Error(`You already have a pending brand named "${brandData.name}". Please wait for approval or use the existing one.`);
    }

    // Generate slug from name
    let slug = brandData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Check if slug already exists and make it unique
    let existingBrandBySlug = await Brand.findOne({ slug });
    let counter = 1;
    while (existingBrandBySlug) {
        slug = `${brandData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${counter}`;
        existingBrandBySlug = await Brand.findOne({ slug });
        counter++;
    }

    const brand = new Brand({
        ...brandData,
        slug,
        admin_user_id: userId,
        created_by: userId,
        verification_status: 'pending',
        is_featured: false
    });

    await brand.save();

    // Assign brand-level restaurant_owner role to the user
    const user = await User.findById(userId);
    if (user) {
        const hasBrandRole = user.roles.some(r =>
            r.scope === 'brand' &&
            r.role === 'restaurant_owner' &&
            r.brandId?.toString() === brand._id.toString()
        );

        if (!hasBrandRole) {
            user.roles.push({
                scope: 'brand',
                role: 'restaurant_owner',
                brandId: brand._id as mongoose.Types.ObjectId,
                permissions: [],
                assignedAt: new Date(),
                assignedBy: userId as unknown as mongoose.Types.ObjectId
            } as any);
            await user.save();
            console.log('✅ Assigned brand-level role to user:', userId, 'for brand:', brand._id);
        }
    }

    return brand;
};

/**
 * Update brand
 */
export const updateBrand = async (
    brandId: string,
    userId: string,
    updateData: Partial<IBrand>
): Promise<IBrand | null> => {
    const brand = await Brand.findOne({ _id: brandId, admin_user_id: userId });

    if (!brand) {
        throw new Error('Brand not found or unauthorized');
    }

    // Check if new name already exists globally (excluding current brand)
    if (updateData.name && updateData.name !== brand.name) {
        const existingBrandByName = await Brand.findOne({
            name: { $regex: new RegExp(`^${updateData.name}$`, 'i') },
            _id: { $ne: brandId },
            verification_status: 'approved'
        });

        if (existingBrandByName) {
            throw new Error(`A brand named "${updateData.name}" already exists. Please choose a different name.`);
        }
    }

    // Update allowed fields
    const allowedFields = ['name', 'description', 'logo_url', 'cuisines', 'operating_modes', 'social_media'];
    allowedFields.forEach(field => {
        if (updateData[field as keyof IBrand] !== undefined) {
            (brand as any)[field] = updateData[field as keyof IBrand];
        }
    });

    // Update slug if name changed
    if (updateData.name) {
        brand.slug = updateData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    await brand.save();
    return brand;
};

/**
 * Get sample/public brands for selection
 */
export const getPublicBrands = async (userId?: string): Promise<IBrand[]> => {
    let query: any;

    // Include user's own brands (pending or approved) and approved brands from others
    if (userId) {
        query = {
            $or: [
                { created_by: userId },
                { admin_user_id: userId },
                { verification_status: 'approved' }
            ]
        };
    } else {
        query = {
            verification_status: 'approved'
        };
    }

    console.log('🔍 Brand Query:', JSON.stringify(query));
    console.log('🔍 User ID:', userId);

    const brands = await Brand.find(query).limit(50).lean();

    // Check for pending update requests
    const enrichedBrands = await Promise.all(brands.map(async (brand: any) => {
        const pendingUpdate = await BrandUpdateRequest.findOne({
            brand_id: brand._id,
            status: 'pending'
        });
        return {
            ...brand,
            has_pending_update: !!pendingUpdate
        };
    }));

    return enrichedBrands as unknown as IBrand[];
};

/**
 * Search brands by name
 */
export const searchBrands = async (query: string, userId?: string): Promise<IBrand[]> => {
    let searchQuery: any;

    // Include user's own brands (any status) and approved public brands
    if (userId) {
        searchQuery = {
            name: { $regex: query, $options: 'i' },
            is_active: true,
            $or: [
                { created_by: userId },
                { admin_user_id: userId },
                { verification_status: 'approved' }
            ]
        };
    } else {
        searchQuery = {
            name: { $regex: query, $options: 'i' },
            is_active: true,
            verification_status: 'approved'
        };
    }

    const brands = await Brand.find(searchQuery).limit(20).lean();

    // Check for pending update requests
    const enrichedBrands = await Promise.all(brands.map(async (brand: any) => {
        const pendingUpdate = await BrandUpdateRequest.findOne({
            brand_id: brand._id,
            status: 'pending'
        });
        return {
            ...brand,
            has_pending_update: !!pendingUpdate
        };
    }));

    return enrichedBrands as unknown as IBrand[];
};
