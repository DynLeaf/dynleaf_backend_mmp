import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Category } from '../models/Category.js';
import { FoodItem } from '../models/FoodItem.js';
import { AddOn } from '../models/AddOn.js';
import { Combo } from '../models/Combo.js';
import { Outlet } from '../models/Outlet.js';
import { sendSuccess, sendError } from '../utils/response.js';

/**
 * Outlet-Centric Menu Management Controller
 * All operations are scoped to a specific outlet
 */

// ==================== CATEGORIES ====================

export const createCategoryForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { name, description, imageUrl, isActive, sortOrder } = req.body;

        const trimmedName = typeof name === 'string' ? name.trim() : '';
        if (!trimmedName) {
            return sendError(res, 'Category name is required', null, 400);
        }

        const sortOrderNum =
            sortOrder === undefined || sortOrder === null
                ? undefined
                : Number(sortOrder);

        // Verify outlet exists
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // Generate slug from name
        const baseSlug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        let slug = baseSlug;
        let counter = 1;
        
        // Ensure slug is unique for this outlet
        while (await Category.findOne({ outlet_id: outletId, slug })) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        const category = await Category.create({
            outlet_id: outletId,
            name: trimmedName,
            slug,
            description,
            image_url: imageUrl,
            display_order: Number.isFinite(sortOrderNum as number) ? sortOrderNum : undefined,
            is_active: isActive ?? true
        });

        return sendSuccess(res, { 
            id: category._id, 
            name: category.name, 
            slug: category.slug, 
            description: category.description,
            imageUrl: category.image_url,
            sortOrder: category.display_order,
            isActive: category.is_active 
        }, null, 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const listCategoriesForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        
        const categories = await Category.find({ outlet_id: outletId }).sort({ display_order: 1, name: 1 });

        const counts = await FoodItem.aggregate([
            { $match: { outlet_id: new mongoose.Types.ObjectId(outletId) } },
            { $group: { _id: '$category_id', count: { $sum: 1 } } }
        ]);

        const countByCategoryId = new Map<string, number>();
        for (const row of counts) {
            if (row?._id) countByCategoryId.set(String(row._id), Number(row.count) || 0);
        }

        return sendSuccess(res, categories.map(c => ({ 
            id: c._id, 
            name: c.name, 
            slug: c.slug, 
            description: c.description,
            imageUrl: c.image_url,
            sortOrder: c.display_order,
            isActive: c.is_active,
            itemCount: countByCategoryId.get(String(c._id)) || 0
        })));
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const updateCategoryForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, categoryId } = req.params;
        
        // Verify category belongs to outlet
        const category = await Category.findOne({ _id: categoryId, outlet_id: outletId });
        if (!category) {
            return sendError(res, 'Category not found for this outlet', 404);
        }

        const body: any = req.body || {};

        const updates: any = { ...body };

        if (updates.name !== undefined) {
            const trimmedName = typeof updates.name === 'string' ? updates.name.trim() : '';
            if (!trimmedName) {
                return sendError(res, 'Category name is required', null, 400);
            }
            updates.name = trimmedName;

            // Regenerate slug if name changes
            const baseSlug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            let slug = baseSlug;
            let counter = 1;
            while (
                await Category.findOne({
                    outlet_id: outletId,
                    slug,
                    _id: { $ne: categoryId }
                })
            ) {
                slug = `${baseSlug}-${counter}`;
                counter++;
            }
            updates.slug = slug;
        }

        if (body.imageUrl !== undefined && body.image_url === undefined) {
            updates.image_url = body.imageUrl;
            delete updates.imageUrl;
        }

        if (body.isActive !== undefined && body.is_active === undefined) {
            updates.is_active = body.isActive;
            delete updates.isActive;
        }

        if (body.sortOrder !== undefined && body.display_order === undefined) {
            const sortOrderNum = Number(body.sortOrder);
            if (!Number.isFinite(sortOrderNum)) {
                return sendError(res, 'Invalid sortOrder', null, 400);
            }
            updates.display_order = sortOrderNum;
            delete updates.sortOrder;
        }

        const updatedCategory = await Category.findByIdAndUpdate(categoryId, updates, { new: true });

        const itemCount = await FoodItem.countDocuments({ outlet_id: outletId, category_id: categoryId });
        return sendSuccess(res, { 
            id: updatedCategory?._id, 
            name: updatedCategory?.name, 
            description: updatedCategory?.description,
            imageUrl: updatedCategory?.image_url,
            sortOrder: updatedCategory?.display_order,
            isActive: updatedCategory?.is_active,
            itemCount
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const deleteCategoryForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, categoryId } = req.params;
        
        // Verify category belongs to outlet
        const category = await Category.findOne({ _id: categoryId, outlet_id: outletId });
        if (!category) {
            return sendError(res, 'Category not found for this outlet', 404);
        }

        const itemsCount = await FoodItem.countDocuments({ outlet_id: outletId, category_id: categoryId });
        if (itemsCount > 0) {
            return sendError(
                res,
                'Cannot delete category while it has menu items. Move items to another category first.',
                { itemsCount },
                400
            );
        }

        await Category.findByIdAndDelete(categoryId);
        return sendSuccess(res, null, 'Category deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

// ==================== FOOD ITEMS ====================

export const createFoodItemForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { name, description, categoryId, itemType, isVeg, basePrice, taxPercentage, imageUrl, isActive, addonIds } = req.body;

        // Verify outlet exists
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // Determine food_type from isVeg
        const foodType = isVeg ? 'veg' : 'non-veg';
       
        // Prepare food item data
        const foodItemData: any = {
            outlet_id: outletId,
            category_id: categoryId,
            name,
            description,
            item_type: itemType || 'food',
            food_type: foodType,
            is_veg: isVeg ?? true,
            price: basePrice,
            tax_percentage: taxPercentage ?? 5,
            image_url: imageUrl,
            is_active: isActive ?? true,
            is_available: isActive ?? true,
            addon_ids: addonIds || []
        };

        // Copy location from outlet if available (for geospatial queries)
        if (outlet.location && outlet.location.coordinates && outlet.location.coordinates.length === 2) {
            foodItemData.location = {
                type: 'Point',
                coordinates: outlet.location.coordinates
            };
        }

        const foodItem = await FoodItem.create(foodItemData);

        return sendSuccess(res, { 
            id: foodItem._id, 
            categoryId: foodItem.category_id, 
            addonIds: foodItem.addon_ids, 
            name: foodItem.name, 
            itemType: foodItem.item_type, 
            isVeg: foodItem.is_veg, 
            basePrice: foodItem.price, 
            isActive: foodItem.is_active 
        }, null, 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const listFoodItemsForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { search, category, tags, isVeg, isActive, itemType, page = '1', limit = '50', sortBy = 'created_at', sortOrder = 'desc' } = req.query;

        const query: any = { outlet_id: outletId };
        
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }
        
        if (tags) {
            const tagArray = typeof tags === 'string' ? tags.split(',') : tags;
            query.tags = { $in: tagArray };
        }
        
        if (isVeg !== undefined) {
            query.is_veg = isVeg === 'true';
        }
        
        if (isActive !== undefined) {
            query.is_active = isActive === 'true';
        }
        
        if (itemType && (itemType === 'food' || itemType === 'beverage')) {
            query.item_type = itemType;
        }

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;

        const sortOptions: any = {};
        sortOptions[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

        const [items, total] = await Promise.all([
            FoodItem.find(query).sort(sortOptions).skip(skip).limit(limitNum),
            FoodItem.countDocuments(query)
        ]);

        const mappedItems = items.map(i => ({
            id: i._id,
            categoryId: i.category_id ? i.category_id.toString() : null,
            addonIds: i.addon_ids ? i.addon_ids.map(a => a.toString()) : [],
            name: i.name,
            description: i.description,
            itemType: i.item_type,
            isVeg: i.is_veg,
            basePrice: i.price,
            taxPercentage: i.tax_percentage,
            imageUrl: i.image_url,
            isActive: i.is_active,
            tags: i.tags,
            order: i.order,
            preparationTime: i.preparation_time,
            calories: i.calories,
            spiceLevel: i.spice_level,
            allergens: i.allergens,
            isFeatured: i.is_featured,
            discountPercentage: i.discount_percentage
        }));
      
        return sendSuccess(res, {
            items: mappedItems,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const updateFoodItemForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, foodItemId } = req.params;
        
        // Verify food item belongs to outlet
        const foodItem = await FoodItem.findOne({ _id: foodItemId, outlet_id: outletId });
        if (!foodItem) {
            return sendError(res, 'Food item not found for this outlet', 404);
        }

        const item = await FoodItem.findByIdAndUpdate(foodItemId, req.body, { new: true });
        return sendSuccess(res, { 
            id: item?._id, 
            name: item?.name, 
            isVeg: item?.is_veg, 
            basePrice: item?.price, 
            isActive: item?.is_active 
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const deleteFoodItemForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, foodItemId } = req.params;
        
        // Verify food item belongs to outlet
        const foodItem = await FoodItem.findOne({ _id: foodItemId, outlet_id: outletId });
        if (!foodItem) {
            return sendError(res, 'Food item not found for this outlet', 404);
        }

        await FoodItem.findByIdAndDelete(foodItemId);
        return sendSuccess(res, null, 'Food item deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const duplicateFoodItemForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, foodItemId } = req.params;
        
        // Verify food item belongs to outlet
        const originalItem = await FoodItem.findOne({ _id: foodItemId, outlet_id: outletId });
        if (!originalItem) {
            return sendError(res, 'Food item not found for this outlet', 404);
        }

        const duplicatedItem = await FoodItem.create({
            outlet_id: originalItem.outlet_id,
            category_id: originalItem.category_id,
            name: `${originalItem.name} (Copy)`,
            description: originalItem.description,
            item_type: originalItem.item_type,
            food_type: originalItem.food_type,
            is_veg: originalItem.is_veg,
            is_active: originalItem.is_active,
            is_available: originalItem.is_available,
            price: originalItem.price,
            tax_percentage: originalItem.tax_percentage,
            image_url: originalItem.image_url,
            location: originalItem.location,
            tags: originalItem.tags,
            preparation_time: originalItem.preparation_time,
            calories: originalItem.calories,
            spice_level: originalItem.spice_level,
            allergens: originalItem.allergens,
            is_featured: false,
            discount_percentage: originalItem.discount_percentage
        });

        return sendSuccess(res, { 
            id: duplicatedItem._id, 
            name: duplicatedItem.name,
            isVeg: duplicatedItem.is_veg,
            basePrice: duplicatedItem.price,
            isActive: duplicatedItem.is_active
        }, 'Food item duplicated successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const bulkUpdateFoodItemsForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { itemIds, updates } = req.body;

        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return sendError(res, 'Item IDs are required', 400);
        }

        if (!updates || typeof updates !== 'object') {
            return sendError(res, 'Updates object is required', 400);
        }

        // Only update items that belong to this outlet
        const result = await FoodItem.updateMany(
            { _id: { $in: itemIds }, outlet_id: outletId },
            { $set: updates }
        );

        return sendSuccess(res, null, `${result.modifiedCount} items updated successfully`);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const bulkDeleteFoodItemsForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { itemIds } = req.body;

        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return sendError(res, 'Item IDs are required', 400);
        }

        // Only delete items that belong to this outlet
        const result = await FoodItem.deleteMany({ 
            _id: { $in: itemIds }, 
            outlet_id: outletId 
        });

        return sendSuccess(res, null, `${result.deletedCount} items deleted successfully`);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const uploadFoodItemImageForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, foodItemId } = req.params;
        const { image, imageUrl, url } = req.body as { image?: string; imageUrl?: string; url?: string };

        const input = imageUrl || url || image;

        if (!input || typeof input !== 'string') {
            return sendError(res, 'Image data is required', 400);
        }

        // Verify food item belongs to outlet
        const foodItem = await FoodItem.findOne({ _id: foodItemId, outlet_id: outletId });
        if (!foodItem) {
            return sendError(res, 'Food item not found for this outlet', 404);
        }

        let finalUrl: string;
        if (input.startsWith('data:')) {
            // Use existing file upload utility (legacy base64 flow)
            const { saveBase64Image } = await import('../utils/fileUpload.js');
            const uploadResult = await saveBase64Image(input, 'menu');
            finalUrl = uploadResult.url;
        } else if (input.startsWith('http://') || input.startsWith('https://') || input.startsWith('/uploads/')) {
            // New flow: client uploads to Cloudinary and sends us the hosted URL
            finalUrl = input;
        } else {
            return sendError(res, 'Invalid image data', 400);
        }

        const item = await FoodItem.findByIdAndUpdate(
            foodItemId,
            { image_url: finalUrl },
            { new: true }
        );

        return sendSuccess(res, { imageUrl: finalUrl }, 'Image uploaded successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

// ==================== ADD-ONS ====================

export const createAddOnForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { name, price, category, isActive } = req.body;

        // Verify outlet exists
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // Add-ons are outlet-level, so use outlet_id
        const addOn = await AddOn.create({
            outlet_id: outletId,
            name,
            price,
            category,
            is_active: isActive
        });

        return sendSuccess(res, {
            id: addOn._id,
            name: addOn.name,
            price: addOn.price,
            category: addOn.category,
            isActive: addOn.is_active
        }, null, 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const listAddOnsForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;

        // Verify outlet exists
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        const addOns = await AddOn.find({ outlet_id: outletId });

        return sendSuccess(res, addOns.map(a => ({
            id: a._id,
            name: a.name,
            price: a.price,
            category: a.category,
            isActive: a.is_active
        })));
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const updateAddOnForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, addOnId } = req.params;

        // Verify outlet exists
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // Verify add-on belongs to the same brand
        const addOn = await AddOn.findOne({ _id: addOnId, brand_id: outlet.brand_id });
        if (!addOn) {
            return sendError(res, 'Add-on not found for this outlet\'s brand', 404);
        }

        const updatedAddOn = await AddOn.findByIdAndUpdate(addOnId, req.body, { new: true });
        return sendSuccess(res, {
            id: updatedAddOn?._id,
            name: updatedAddOn?.name,
            price: updatedAddOn?.price,
            category: updatedAddOn?.category,
            isActive: updatedAddOn?.is_active
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const deleteAddOnForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, addOnId } = req.params;

        // Verify outlet exists
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // Verify add-on belongs to the same brand
        const addOn = await AddOn.findOne({ _id: addOnId, brand_id: outlet.brand_id });
        if (!addOn) {
            return sendError(res, 'Add-on not found for this outlet\'s brand', 404);
        }

        await AddOn.findByIdAndDelete(addOnId);
        return sendSuccess(res, null, 'Add-on deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

// ==================== COMBOS ====================

export const createComboForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { name, description, imageUrl, items, discountPercentage = 0, manualPriceOverride = false, price, isActive } = req.body;

        // Verify outlet exists
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        const normalizedItems = (items || []).map((i: any) => ({
            foodItemId: i.foodItemId ?? i.itemId,
            quantity: i.quantity
        }));

        // Calculate pricing
        const foodItemIds = normalizedItems.map((i: any) => i.foodItemId);
        const foodItems = await FoodItem.find({ _id: { $in: foodItemIds } });
        const priceById = new Map(foodItems.map(fi => [fi._id.toString(), fi.price]));

        const originalPrice = normalizedItems.reduce((sum: number, i: any) => {
            const basePrice = priceById.get(i.foodItemId) ?? 0;
            return sum + basePrice * i.quantity;
        }, 0);

        const discountedPrice = Math.max(0, originalPrice * (1 - (discountPercentage || 0) / 100));
        const finalPrice = manualPriceOverride ? (price ?? discountedPrice) : discountedPrice;

        // Combos are outlet-level
        const combo = await Combo.create({
            outlet_id: outletId,
            name,
            description,
            image_url: imageUrl,
            items: normalizedItems.map((i: any) => ({
                food_item_id: i.foodItemId,
                quantity: i.quantity
            })),
            discount_percentage: discountPercentage,
            original_price: originalPrice,
            price: finalPrice,
            manual_price_override: manualPriceOverride,
            is_active: isActive
        });

        return sendSuccess(res, {
            id: combo._id,
            name: combo.name,
            description: combo.description,
            imageUrl: combo.image_url,
            items: combo.items.map(i => ({ foodItemId: i.food_item_id, quantity: i.quantity })),
            discountPercentage: combo.discount_percentage,
            originalPrice: combo.original_price,
            price: combo.price,
            manualPriceOverride: combo.manual_price_override,
            isActive: combo.is_active
        }, null, 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const listCombosForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;

        // Verify outlet exists
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        const combos = await Combo.find({ outlet_id: outletId });

        return sendSuccess(res, combos.map(c => ({
            id: c._id,
            name: c.name,
            description: c.description,
            imageUrl: c.image_url,
            items: c.items.map(i => ({ foodItemId: i.food_item_id, quantity: i.quantity })),
            discountPercentage: c.discount_percentage,
            originalPrice: c.original_price,
            price: c.price,
            manualPriceOverride: c.manual_price_override,
            isActive: c.is_active
        })));
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const updateComboForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, comboId } = req.params;

        // Verify outlet exists
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // Verify combo belongs to the same brand
        const combo = await Combo.findOne({ _id: comboId, brand_id: outlet.brand_id });
        if (!combo) {
            return sendError(res, 'Combo not found for this outlet\'s brand', 404);
        }

        const { name, description, imageUrl, items, discountPercentage, manualPriceOverride, price, isActive } = req.body;

        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (imageUrl !== undefined) updates.image_url = imageUrl;
        if (discountPercentage !== undefined) updates.discount_percentage = discountPercentage;
        if (manualPriceOverride !== undefined) updates.manual_price_override = manualPriceOverride;
        if (isActive !== undefined) updates.is_active = isActive;

        const isItemsProvided = items !== undefined;
        const normalizedItems: Array<{ foodItemId: string; quantity: number }> = isItemsProvided
            ? (items || []).map((i: any) => ({
                foodItemId: i.foodItemId ?? i.itemId,
                quantity: i.quantity
            }))
            : [];

        if (isItemsProvided) {
            updates.items = normalizedItems.map((i: any) => ({
                food_item_id: i.foodItemId,
                quantity: i.quantity
            }));
        }

        const effectiveItems = isItemsProvided
            ? normalizedItems
            : combo.items.map((i: any) => ({
                foodItemId: i.food_item_id.toString(),
                quantity: i.quantity
            }));
        const effectiveDiscount = discountPercentage !== undefined ? discountPercentage : combo.discount_percentage;
        const effectiveManualOverride = manualPriceOverride !== undefined ? manualPriceOverride : combo.manual_price_override;

        // Recalculate pricing
        const foodItemIds = effectiveItems.map((i: any) => i.foodItemId);
        const foodItems = await FoodItem.find({ _id: { $in: foodItemIds } });
        const priceById = new Map(foodItems.map(fi => [fi._id.toString(), fi.price]));

        const originalPrice = effectiveItems.reduce((sum: number, i: any) => {
            const basePrice = priceById.get(i.foodItemId) ?? 0;
            return sum + basePrice * i.quantity;
        }, 0);

        const discountedPrice = Math.max(0, originalPrice * (1 - (effectiveDiscount || 0) / 100));
        updates.original_price = originalPrice;
        updates.price = effectiveManualOverride ? (price ?? combo.price) : discountedPrice;

        const updatedCombo = await Combo.findByIdAndUpdate(comboId, updates, { new: true });

        return sendSuccess(res, {
            id: updatedCombo?._id,
            name: updatedCombo?.name,
            description: updatedCombo?.description,
            imageUrl: updatedCombo?.image_url,
            items: updatedCombo?.items.map((i: any) => ({ foodItemId: i.food_item_id, quantity: i.quantity })),
            discountPercentage: updatedCombo?.discount_percentage,
            originalPrice: updatedCombo?.original_price,
            price: updatedCombo?.price,
            manualPriceOverride: updatedCombo?.manual_price_override,
            isActive: updatedCombo?.is_active
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const deleteComboForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, comboId } = req.params;

        // Verify outlet exists
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // Verify combo belongs to the same brand
        const combo = await Combo.findOne({ _id: comboId, brand_id: outlet.brand_id });
        if (!combo) {
            return sendError(res, 'Combo not found for this outlet\'s brand', 404);
        }

        await Combo.findByIdAndDelete(comboId);
        return sendSuccess(res, null, 'Combo deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};
