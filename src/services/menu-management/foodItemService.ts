import mongoose from 'mongoose';
import * as foodItemRepo from '../../repositories/foodItemRepository.js';
import * as foodVariantRepo from '../../repositories/foodVariantRepository.js';
import * as comboRepo from '../../repositories/comboRepository.js';
import * as offerRepo from '../../repositories/offerRepository.js';
import * as outletRepo from '../../repositories/outletRepository.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';

const normalizeString = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    return String(value).trim();
};

const normalizeFoodItemData = (data: Record<string, any>) => {
    return {
        name: normalizeString(data.name),
        description: normalizeString(data.description) || undefined,
        item_type: data.itemType || 'food',
        is_veg: data.isVeg ?? true,
        food_type: (data.isVeg ?? true) ? 'veg' : 'non-veg',
        price: Number(data.price || data.basePrice || 0),
        tax_percentage: data.taxPercentage ?? 5,
        image_url: normalizeString(data.imageUrl || data.image) || undefined,
        is_active: data.isActive ?? true,
        is_available: data.isAvailable ?? (data.isActive ?? true),
        addon_ids: data.addonIds || [],
        tags: data.tags || [],
        variants: data.variants || [],
        preparation_time: data.preparationTime,
        calories: data.calories,
        spice_level: data.spiceLevel,
        allergens: data.allergens,
        is_featured: data.isFeatured ?? false,
        is_recommended: data.isRecommended ?? false,
        discount_percentage: data.discountPercentage,
        display_order: data.displayOrder ?? 0,
        price_display_type: data.priceDisplayType ?? 'fixed'
    };
};

export const createFoodItem = async (outletId: string, foodItemData: Record<string, unknown>, session?: mongoose.ClientSession) => {
    const outlet = await outletRepo.findById(outletId);
    if (!outlet) throw new AppError('Outlet not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const payload = normalizeFoodItemData(foodItemData);
    const data: Record<string, unknown> = {
        ...payload,
        outlet_id: outletId
    };

    if (outlet.location?.coordinates?.length === 2) {
        data.location = {
            type: 'Point',
            coordinates: outlet.location.coordinates
        };
    }

    return await foodItemRepo.create(data, session);
};

export const listFoodItems = async (outletId: string, queryParams: Record<string, unknown>) => {
    const { search, category, tags, isVeg, isActive, itemType, page = '1', limit = '50', sortBy = 'created_at', sortOrder = 'desc' } = queryParams as {
        search?: string;
        category?: string;
        tags?: string | string[];
        isVeg?: string;
        isActive?: string;
        itemType?: string;
        page?: string;
        limit?: string;
        sortBy?: string;
        sortOrder?: string;
    };

    const query: Record<string, unknown> = {};
    if (search) query.name = { $regex: search, $options: 'i' };
    if (tags) {
        const tagArray = typeof tags === 'string' ? tags.split(',') : tags;
        query.tags = { $in: tagArray };
    }
    if (isVeg !== undefined) query.is_veg = isVeg === 'true';
    if (isActive !== undefined) query.is_active = isActive === 'true';
    if (itemType && (itemType === 'food' || itemType === 'beverage')) query.item_type = itemType;
    if (category) query.category_id = category;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const sortOptions: Record<string, number> = {};
    if (sortBy === 'created_at') sortOptions.display_order = 1;
    sortOptions[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

    const [items, total] = await Promise.all([
        foodItemRepo.findByOutletId(outletId, query, sortOptions, skip, limitNum),
        foodItemRepo.countDocuments({ ...query, outlet_id: outletId })
    ]);

    return {
        items,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
        }
    };
};

export const updateFoodItem = async (outletId: string, foodItemId: string, updateData: Record<string, unknown>) => {
    const foodItem = await foodItemRepo.findByOutletAndId(outletId, foodItemId);
    if (!foodItem) throw new AppError('Food item not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const updates: Record<string, unknown> = { ...updateData };
    
    if (updateData.itemNumber !== undefined) updates.item_number = normalizeString(updateData.itemNumber) || undefined;
    if (updateData.isVeg !== undefined) {
        updates.is_veg = updateData.isVeg;
        updates.food_type = updateData.isVeg ? 'veg' : 'non-veg';
    }
    
    if (updateData.isActive !== undefined) {
        updates.is_active = updateData.isActive;
        if (updateData.isAvailable === undefined) updates.is_available = updateData.isActive;
    }

    return await foodItemRepo.updateById(foodItemId, updates);
};

export const deleteFoodItem = async (outletId: string, foodItemId: string) => {
    const foodItem = await foodItemRepo.findByOutletAndId(outletId, foodItemId);
    if (!foodItem) throw new AppError('Food item not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const [combosCount, offersCount] = await Promise.all([
        comboRepo.countByFoodItem(outletId, foodItemId),
        offerRepo.countByFoodItem(outletId, foodItemId)
    ]);

    if (combosCount > 0 || offersCount > 0) {
        throw new AppError('Cannot delete food item because it is used in combos/offers', 400, ErrorCode.VALIDATION_ERROR);
    }

    return await foodItemRepo.deleteById(foodItemId);
};

export const duplicateFoodItem = async (outletId: string, foodItemId: string) => {
    const originalItem = await foodItemRepo.findByOutletAndId(outletId, foodItemId);
    if (!originalItem) throw new AppError('Food item not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const duplicatedData = {
        ...originalItem.toObject(),
        _id: undefined,
        name: `${originalItem.name} (Copy)`,
        is_featured: false,
        created_at: undefined,
        updated_at: undefined
    };

    return await foodItemRepo.create(duplicatedData);
};

export const bulkUpdateFoodItems = async (outletId: string, itemIds: string[], updates: Record<string, unknown>) => {
    const sanitizedUpdates: Record<string, unknown> = { ...updates };
    // Aligns with provided code's alignment logic
    if (updates.is_active !== undefined && updates.is_available === undefined) {
        sanitizedUpdates.is_available = updates.is_active;
    }
    if (updates.is_veg !== undefined) {
        sanitizedUpdates.food_type = updates.is_veg ? 'veg' : 'non-veg';
    }

    return await foodItemRepo.bulkUpdate(itemIds, outletId, sanitizedUpdates);
};

export const bulkDeleteFoodItems = async (outletId: string, itemIds: string[]) => {
    // Check if any items are protected (used in combos or offers)
    const comboProtected = await comboRepo.distinctFoodItemIds({
        outlet_id: outletId,
        'items.food_item_id': { $in: itemIds }
    }) as unknown as string[];

    const offerProtected = await offerRepo.distinctFoodItemIds({
        outlet_ids: outletId,
        applicable_food_item_ids: { $in: itemIds }
    }) as unknown as string[];

    const protectedIds = Array.from(
        new Set([
            ...comboProtected.map((id) => String(id)),
            ...offerProtected.map((id) => String(id))
        ])
    );

    if (protectedIds.length > 0) {
        throw new AppError('Cannot bulk delete: some items are used in combos/offers', 400, ErrorCode.VALIDATION_ERROR);
    }

    return await foodItemRepo.updateMany(
        { _id: { $in: itemIds }, outlet_id: outletId },
        { $set: { is_deleted: true } }
    );
};

export const uploadFoodItemImage = async (outletId: string, foodItemId: string, imageData: string) => {
    const foodItem = await foodItemRepo.findByOutletAndId(outletId, foodItemId);
    if (!foodItem) throw new AppError('Food item not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    let finalUrl: string;
    if (imageData.startsWith('data:')) {
        // This is a bit of a hack since we can't easily import a service that might not be refactored yet
        // but let's follow the pattern in the original controller
        const s3Service = (await import('../s3Service.js')).getS3Service();
        const matches = imageData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) throw new AppError('Invalid base64 string', 400, ErrorCode.VALIDATION_ERROR);
        
        const buffer = Buffer.from(matches[2], 'base64');
        const uploadedFile = await s3Service.uploadBuffer(buffer, 'menu', foodItemId, `menu-${Date.now()}`, matches[1]);
        finalUrl = uploadedFile.key;
    } else if (imageData.startsWith('http') || imageData.startsWith('/uploads/')) {
        finalUrl = imageData;
    } else {
        throw new AppError('Invalid image data', 400, ErrorCode.VALIDATION_ERROR);
    }

    return await foodItemRepo.updateById(foodItemId, { image_url: finalUrl });
};

export const getFoodItemById = async (foodItemId: string) => {
    let item;
    if (mongoose.Types.ObjectId.isValid(foodItemId)) {
        item = await foodItemRepo.findById(foodItemId);
    } else {
        item = await foodItemRepo.findBySlug(foodItemId);
    }

    if (!item) throw new AppError('Food item not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const outlet = await outletRepo.findById(item.outlet_id.toString());
    // In original code it populates brand_id
    // Here we can just return the item and let the controller handle formatting if needed
    return { ...item.toObject(), outlet };
};

export const createVariant = async (foodItemId: string, variantData: Record<string, unknown>) => {
    return await foodVariantRepo.create({ ...variantData, food_item_id: foodItemId });
};

export const updateVariant = async (variantId: string, updateData: Record<string, unknown>) => {
    const variant = await foodVariantRepo.findByIdAndUpdate(variantId, updateData);
    if (!variant) throw new AppError('Variant not found', 404, ErrorCode.RESOURCE_NOT_FOUND);
    return variant;
};
