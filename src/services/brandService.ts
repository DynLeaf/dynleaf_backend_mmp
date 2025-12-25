import { Brand, IBrand } from '../models/Brand.js';
import { User } from '../models/User.js';
import mongoose from 'mongoose';

/**
 * Get all brands for a user
 */
export const getUserBrands = async (userId: string): Promise<IBrand[]> => {
    return await Brand.find({ admin_user_id: userId, is_active: true });
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
    // Check if brand with same name already exists for this user
    const existingUserBrand = await Brand.findOne({ 
        name: { $regex: new RegExp(`^${brandData.name}$`, 'i') },
        admin_user_id: userId,
        is_active: true
    });
    
    if (existingUserBrand) {
        throw new Error(`You already have a brand named "${brandData.name}". Please choose a different name.`);
    }
    
    // Generate slug from name
    let slug = brandData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    // Check if slug already exists and make it unique
    let existingBrand = await Brand.findOne({ slug });
    let counter = 1;
    while (existingBrand) {
        slug = `${brandData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${counter}`;
        existingBrand = await Brand.findOne({ slug });
        counter++;
    }
    
    const brand = new Brand({
        ...brandData,
        slug,
        admin_user_id: userId,
        verification_status: 'pending',
        is_active: true,
        is_public: false,
        is_featured: false
    });

    await brand.save();
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
    const query: any = { is_active: true };
    
    // Include user's own brands and public brands
    if (userId) {
        query.$or = [
            { admin_user_id: userId },
            { is_public: true }
        ];
    } else {
        query.is_public = true;
    }
    
    return await Brand.find(query).limit(50);
};

/**
 * Search brands by name
 */
export const searchBrands = async (query: string, userId?: string): Promise<IBrand[]> => {
    const searchQuery: any = {
        name: { $regex: query, $options: 'i' },
        is_active: true
    };

    // Include user's own brands and public brands
    if (userId) {
        searchQuery.$or = [
            { admin_user_id: userId },
            { is_public: true }
        ];
    } else {
        searchQuery.is_public = true;
    }

    return await Brand.find(searchQuery).limit(20);
};
