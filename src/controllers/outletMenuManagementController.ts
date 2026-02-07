import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Category } from '../models/Category.js';
import { FoodItem } from '../models/FoodItem.js';
import { AddOn } from '../models/AddOn.js';
import { Combo } from '../models/Combo.js';
import { Offer } from '../models/Offer.js';
import { Outlet } from '../models/Outlet.js';
import { sendSuccess, sendError } from '../utils/response.js';

/**
 * Outlet-Centric Menu Management Controller
 * All operations are scoped to a specific outlet
 */

type ImportDuplicateStrategy = 'skip' | 'update' | 'create';

const normalizeString = (value: any): string => {
    if (value === null || value === undefined) return '';
    return String(value).trim();
};

const parseBoolean = (value: any, defaultValue: boolean): boolean => {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const v = value.toLowerCase().trim();
        if (['true', '1', 'yes', 'y'].includes(v)) return true;
        if (['false', '0', 'no', 'n'].includes(v)) return false;
    }
    return defaultValue;
};

const parsePriceNumber = (value: any): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[^0-9.-]/g, '');
        const parsed = parseFloat(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const normalizeTags = (value: any): string[] => {
    if (Array.isArray(value)) {
        return value.map(v => normalizeString(v)).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(/[,;|]/)
            .map(v => v.trim())
            .filter(Boolean);
    }
    return [];
};

const normalizeVariants = (value: any): { size: string; price: number }[] | undefined => {
    if (value === undefined || value === null) return undefined;
    if (!Array.isArray(value)) return undefined;

    const variants: { size: string; price: number }[] = [];
    for (const v of value) {
        const rawSize = (v as any)?.size ?? (v as any)?.name;
        const size = normalizeString(rawSize);
        const price = parsePriceNumber((v as any)?.price);
        if (!size) return undefined;
        if (price === null || price < 0) return undefined;
        variants.push({ size, price });
    }
    return variants;
};

const generateUniqueCategorySlugForOutlet = async (outletId: string, name: string, excludeId?: string) => {
    const baseSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    let slug = baseSlug;
    let counter = 1;
    while (
        await Category.findOne({
            outlet_id: outletId,
            slug,
            ...(excludeId ? { _id: { $ne: excludeId } } : {})
        })
    ) {
        slug = `${baseSlug}-${counter}`;
        counter++;
    }
    return slug;
};

// ==================== CATEGORIES ====================
export const bulkUpdateCategoryItemTypeForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, categoryId } = req.params;
        const { itemType } = req.body;

        if (!itemType || (itemType !== 'food' && itemType !== 'beverage')) {
            return sendError(res, 'Valid itemType (food or beverage) is required', 400);
        }

        // Verify category belongs to outlet
        const category = await Category.findOne({ _id: categoryId, outlet_id: outletId });
        if (!category) {
            return sendError(res, 'Category not found for this outlet', 404);
        }

        const result = await FoodItem.updateMany(
            {
                category_id: new mongoose.Types.ObjectId(categoryId),
                outlet_id: new mongoose.Types.ObjectId(outletId)
            },
            { $set: { item_type: itemType } }
        );

        return sendSuccess(res, null, `${result.modifiedCount} items in category converted to ${itemType} successfully`);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

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
        const {
            name,
            description,
            categoryId,
            itemType,
            isVeg,
            taxPercentage,
            imageUrl,
            isAvailable,
            addonIds,
            tags,
            variants,
            preparationTime,
            calories,
            spiceLevel,
            allergens,
            isFeatured,
            discountPercentage,
            isRecommended,
            manualPriceOverride = false,
            price, // Expecting 'price' from frontend
            basePrice, // Fallback 'basePrice'
            displayOrder,
            isActive,
            price_display_type,
            priceDisplayType
        } = req.body;

        const trimmedName = typeof name === 'string' ? name.trim() : '';
        if (!trimmedName) {
            return sendError(res, 'Item name is required', null, 400);
        }

        const resolvedPriceDisplayType = price_display_type || priceDisplayType || 'fixed';
        const isFixedPrice = resolvedPriceDisplayType === 'fixed';

        const priceNum = Number(price ?? basePrice ?? 0);
        if (isFixedPrice && (!Number.isFinite(priceNum) || priceNum < 0)) {
            return sendError(res, 'Invalid price for fixed price item', null, 400);
        }

        // Verify outlet exists
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // Determine food_type from isVeg
        const resolvedIsVeg = isVeg ?? true;
        const foodType = resolvedIsVeg ? 'veg' : 'non-veg';

        const resolvedIsActive = isActive ?? true;
        const resolvedIsAvailable = isAvailable ?? resolvedIsActive;

        const normalizedVariants: { size: string; price: number }[] = [];
        if (variants !== undefined && variants !== null) {
            if (!Array.isArray(variants)) {
                return sendError(res, 'Invalid variants', null, 400);
            }

            for (const v of variants) {
                const rawSize = (v as any)?.size ?? (v as any)?.name;
                const size = typeof rawSize === 'string' ? rawSize.trim() : '';
                if (!size) return sendError(res, 'Variant size is required', null, 400);

                const priceNum = Number((v as any)?.price);
                if (!Number.isFinite(priceNum) || priceNum < 0) {
                    return sendError(res, 'Invalid variant price', null, 400);
                }

                normalizedVariants.push({ size, price: priceNum });
            }
        }

        // Prepare food item data
        const foodItemData: any = {
            outlet_id: outletId,
            category_id: categoryId,
            name: trimmedName,
            description,
            item_type: itemType || 'food',
            food_type: foodType,
            is_veg: resolvedIsVeg,
            price: priceNum,
            tax_percentage: taxPercentage ?? 5,
            image_url: imageUrl,
            is_active: resolvedIsActive,
            is_available: resolvedIsAvailable,
            addon_ids: addonIds || [],
            tags: tags || [],
            variants: normalizedVariants,
            preparation_time: preparationTime,
            calories,
            spice_level: spiceLevel,
            allergens,
            is_featured: isFeatured,
            discount_percentage: discountPercentage,
            is_recommended: isRecommended ?? false,
            display_order: displayOrder ?? 0,
            price_display_type: resolvedPriceDisplayType,
        };

        // Copy location from outlet if available (for geospatial queries)
        if (outlet.location && outlet.location.coordinates && outlet.location.coordinates.length === 2) {
            foodItemData.location = {
                type: 'Point',
                coordinates: outlet.location.coordinates
            };
        }

        const foodItem = await new FoodItem(foodItemData).save();

        return sendSuccess(res, {
            id: foodItem._id,
            categoryId: foodItem.category_id ? foodItem.category_id.toString() : null,
            addonIds: foodItem.addon_ids ? foodItem.addon_ids.map((a: any) => a.toString()) : [],
            name: foodItem.name,
            description: foodItem.description,
            itemType: foodItem.item_type,
            isVeg: foodItem.is_veg,
            basePrice: foodItem.price,
            taxPercentage: foodItem.tax_percentage,
            imageUrl: foodItem.image_url,
            isActive: foodItem.is_active,
            isAvailable: foodItem.is_available,
            tags: foodItem.tags,
            variants: Array.isArray((foodItem as any).variants)
                ? (foodItem as any).variants.map((v: any) => ({ size: v.size, price: v.price }))
                : [],
            preparationTime: foodItem.preparation_time,
            calories: foodItem.calories,
            spiceLevel: foodItem.spice_level,
            allergens: foodItem.allergens,
            isFeatured: foodItem.is_featured,
            isRecommended: foodItem.is_recommended,
            discountPercentage: foodItem.discount_percentage,
            displayOrder: foodItem.display_order,
            price_display_type: foodItem.price_display_type
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

        if (category) {
            query.category_id = category;
        }

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;

        const sortOptions: any = {};
        if (sortBy === 'created_at') {
            sortOptions.display_order = 1; // Default to display_order if no specific sort is requested
        }
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
            isAvailable: i.is_available,
            tags: i.tags,
            variants: Array.isArray((i as any).variants)
                ? (i as any).variants.map((v: any) => ({ size: v.size, price: v.price }))
                : [],
            displayOrder: i.display_order,
            preparationTime: i.preparation_time,
            calories: i.calories,
            spiceLevel: i.spice_level,
            allergens: i.allergens,
            isFeatured: i.is_featured,
            isRecommended: i.is_recommended,
            discountPercentage: i.discount_percentage,
            price_display_type: i.price_display_type
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

        const body: any = req.body || {};
        const updates: any = { ...body };

        if (updates.name !== undefined) {
            const trimmedName = typeof updates.name === 'string' ? updates.name.trim() : '';
            if (!trimmedName) return sendError(res, 'Item name is required', null, 400);
            updates.name = trimmedName;
        }

        if (body.categoryId !== undefined && body.category_id === undefined) {
            updates.category_id = body.categoryId;
            delete updates.categoryId;
        }

        if (body.itemType !== undefined && body.item_type === undefined) {
            updates.item_type = body.itemType;
            delete updates.itemType;
        }

        if (body.isVeg !== undefined && body.is_veg === undefined) {
            updates.is_veg = body.isVeg;
            delete updates.isVeg;
        }

        if (updates.is_veg !== undefined) {
            updates.food_type = updates.is_veg ? 'veg' : 'non-veg';
        }

        // Price can come as basePrice/base_price/price
        const rawPrice = body.basePrice ?? body.base_price ?? body.price;
        const resolvedPriceDisplayType = updates.price_display_type ?? updates.priceDisplayType ?? foodItem.price_display_type ?? 'fixed';
        const isFixedPrice = resolvedPriceDisplayType === 'fixed';

        if (rawPrice !== undefined) {
            const priceNum = Number(rawPrice);
            if (isFixedPrice && (!Number.isFinite(priceNum) || priceNum < 0)) {
                return sendError(res, 'Invalid price for fixed price item', null, 400);
            }
            updates.price = priceNum;
            delete updates.basePrice;
            delete updates.base_price;
        }

        if (updates.priceDisplayType !== undefined) {
            updates.price_display_type = updates.priceDisplayType;
            delete updates.priceDisplayType;
        }

        // Always use the resolved type for consistency
        updates.price_display_type = resolvedPriceDisplayType;

        if (body.imageUrl !== undefined && body.image_url === undefined) {
            updates.image_url = body.imageUrl;
            delete updates.imageUrl;
        }

        if (body.isActive !== undefined && body.is_active === undefined) {
            updates.is_active = body.isActive;
            delete updates.isActive;
        }

        if (body.isAvailable !== undefined && body.is_available === undefined) {
            updates.is_available = body.isAvailable;
            delete updates.isAvailable;
        }

        // Keep is_available aligned when toggling is_active
        if (updates.is_active !== undefined && updates.is_available === undefined) {
            updates.is_available = updates.is_active;
        }

        if (body.preparationTime !== undefined && body.preparation_time === undefined) {
            updates.preparation_time = body.preparationTime;
            delete updates.preparationTime;
        }

        if (body.taxPercentage !== undefined && body.tax_percentage === undefined) {
            updates.tax_percentage = body.taxPercentage;
            delete updates.taxPercentage;
        }

        if (body.addonIds !== undefined && body.addon_ids === undefined) {
            updates.addon_ids = body.addonIds;
            delete updates.addonIds;
        }

        if (body.spiceLevel !== undefined && body.spice_level === undefined) {
            updates.spice_level = body.spiceLevel;
            delete updates.spiceLevel;
        }

        if (body.isFeatured !== undefined && body.is_featured === undefined) {
            updates.is_featured = body.isFeatured;
            delete updates.isFeatured;
        }

        if (body.discountPercentage !== undefined && body.discount_percentage === undefined) {
            updates.discount_percentage = body.discountPercentage;
            delete updates.discountPercentage;
        }

        if (body.isRecommended !== undefined && body.is_recommended === undefined) {
            updates.is_recommended = body.isRecommended;
            delete updates.isRecommended;
        }

        if (body.displayOrder !== undefined && body.display_order === undefined) {
            updates.display_order = body.displayOrder;
            delete updates.displayOrder;
        }

        if (body.variants !== undefined) {
            if (body.variants === null) {
                updates.variants = [];
            } else if (!Array.isArray(body.variants)) {
                return sendError(res, 'Invalid variants', null, 400);
            } else {
                const normalizedVariants: { size: string; price: number }[] = [];
                for (const v of body.variants) {
                    const rawSize = (v as any)?.size ?? (v as any)?.name;
                    const size = typeof rawSize === 'string' ? rawSize.trim() : '';
                    if (!size) return sendError(res, 'Variant size is required', null, 400);

                    const priceNum = Number((v as any)?.price);
                    if (!Number.isFinite(priceNum) || priceNum < 0) {
                        return sendError(res, 'Invalid variant price', null, 400);
                    }

                    normalizedVariants.push({ size, price: priceNum });
                }
                updates.variants = normalizedVariants;
            }
        }

        const item = await FoodItem.findByIdAndUpdate(foodItemId, updates, { new: true });
        return sendSuccess(res, {
            id: item?._id,
            categoryId: item?.category_id ? String(item.category_id) : null,
            addonIds: item?.addon_ids ? item.addon_ids.map((a: any) => String(a)) : [],
            name: item?.name,
            description: item?.description,
            itemType: item?.item_type,
            isVeg: item?.is_veg,
            basePrice: item?.price,
            taxPercentage: item?.tax_percentage,
            imageUrl: item?.image_url,
            isActive: item?.is_active,
            isAvailable: item?.is_available,
            tags: item?.tags,
            variants: item && Array.isArray((item as any).variants)
                ? (item as any).variants.map((v: any) => ({ size: v.size, price: v.price }))
                : [],
            preparationTime: item?.preparation_time,
            calories: item?.calories,
            spiceLevel: item?.spice_level,
            allergens: item?.allergens,
            isFeatured: item?.is_featured,
            isRecommended: item?.is_recommended,
            discountPercentage: item?.discount_percentage,
            displayOrder: item?.display_order,
            price_display_type: item?.price_display_type
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

// ==================== IMPORT / EXPORT / SYNC ====================

export const importMenuForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;

        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        const body: any = req.body || {};
        const items: any[] = Array.isArray(body.items) ? body.items : Array.isArray(body) ? body : [];
        if (!Array.isArray(items) || items.length === 0) {
            return sendError(res, 'No items provided for import', null, 400);
        }

        const options = body.options || {};
        const dryRun = parseBoolean(options.dryRun, false);
        const createMissingCategories = parseBoolean(options.createMissingCategories, true);
        const onDuplicate: ImportDuplicateStrategy =
            options.onDuplicate === 'update' || options.onDuplicate === 'create' || options.onDuplicate === 'skip'
                ? options.onDuplicate
                : 'skip';

        // Preload categories for name->id lookup
        const existingCategories = await Category.find({ outlet_id: outletId });
        const categoryIdByName = new Map<string, string>();
        for (const c of existingCategories) {
            categoryIdByName.set(normalizeString(c.name).toLowerCase(), String(c._id));
        }

        // Preload existing items for duplicate detection
        const existingItems = await FoodItem.find({ outlet_id: outletId }).select('_id name price');
        const existingByKey = new Map<string, string>();
        for (const i of existingItems) {
            const key = `${normalizeString(i.name).toLowerCase()}|${Number(i.price).toFixed(2)}`;
            existingByKey.set(key, String(i._id));
        }

        let created = 0;
        let updated = 0;
        let skipped = 0;
        let failed = 0;

        // Tracks category encounter order for auto-assigning display_order
        let categoryEncounterCount = existingCategories.length;
        const errors: Array<{ index: number; name?: string; message: string }> = [];
        const results: Array<{ index: number; status: 'created' | 'updated' | 'skipped' | 'failed'; id?: string; name?: string }> = [];

        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            const name = normalizeString(item?.name);

            try {
                if (!item || typeof item !== 'object') {
                    throw new Error('Invalid item payload');
                }

                // Handle combo import
                if (parseBoolean(item.isCombo, false)) {
                    console.log('[Import] ========== Processing combo ==========');
                    console.log('[Import] Name:', name);
                    console.log('[Import] ComboType from import:', item.comboType);
                    console.log('[Import] Items array:', JSON.stringify(item.items));
                    console.log('[Import] CustomItems array:', JSON.stringify(item.customItems));

                    // Validate required fields for combo
                    if (!name) {
                        throw new Error('Combo name is required');
                    }

                    const comboPrice = parsePriceNumber(item.price);
                    if (comboPrice === null || comboPrice < 0) {
                        throw new Error('Valid combo price is required');
                    }

                    // Determine combo type
                    let comboType = item.comboType || 'offer';
                    const items = Array.isArray(item.items) ? item.items : [];
                    const customItems = Array.isArray(item.customItems) ? item.customItems : [];

                    // If items are provided, validate they exist
                    let validatedItems: any[] = [];
                    if (items.length > 0) {
                        for (const comboItem of items) {
                            const foodItemId = comboItem.food_item_id || comboItem.foodItemId;
                            if (!foodItemId) {
                                // Items don't have IDs, treat as custom items
                                comboType = 'regular';
                                break;
                            }

                            const exists = await FoodItem.findOne({ _id: foodItemId, outlet_id: outletId });
                            if (!exists) {
                                // Item doesn't exist, treat as regular combo
                                comboType = 'regular';
                                break;
                            }

                            validatedItems.push({
                                food_item_id: foodItemId,
                                quantity: comboItem.quantity || 1
                            });
                        }
                    }

                    // If it's regular combo or items validation failed, use custom items
                    let finalCustomItems: any[] = [];
                    if (comboType === 'regular' || validatedItems.length === 0) {
                        comboType = 'regular';

                        if (customItems.length > 0) {
                            finalCustomItems = customItems.map((ci: any) => ({
                                item_name: ci.itemName || ci.item_name || 'Item',
                                item_image: ci.itemImage || ci.item_image || '',
                                item_quantity: ci.itemQuantity || ci.item_quantity || 1
                            }));
                        } else if (items.length > 0) {
                            // Convert items to custom items
                            finalCustomItems = items.map((i: any) => ({
                                item_name: i.name || i.itemName || 'Item',
                                item_image: i.imageUrl || i.image_url || '',
                                item_quantity: i.quantity || 1
                            }));
                        }
                    }

                    if (!dryRun) {
                        const comboPayload: any = {
                            outlet_id: outletId,
                            combo_type: comboType,
                            name,
                            description: normalizeString(item.description) || '',
                            image_url: normalizeString(item.imageUrl) || '',
                            price: comboPrice,
                            display_order: item.displayOrder ?? index + 1,
                            is_active: parseBoolean(item.isActive, true)
                        };

                        if (comboType === 'offer') {
                            comboPayload.items = validatedItems;
                            comboPayload.discount_percentage = item.discountPercentage || 0;
                            comboPayload.original_price = item.originalPrice || comboPrice;
                            comboPayload.manual_price_override = parseBoolean(item.manualPriceOverride, false);
                        } else {
                            comboPayload.custom_items = finalCustomItems;
                            comboPayload.items = [];
                            comboPayload.discount_percentage = 0;
                            comboPayload.original_price = 0;
                            comboPayload.manual_price_override = false;
                        }

                        if (comboType === 'regular' && finalCustomItems.length === 0) {
                            throw new Error('Regular combo must have at least one custom item');
                        }

                        console.log(`[Import] Creating ${comboType} combo:`, name, 'custom_items:', finalCustomItems.length);

                        const createdCombo = await Combo.create(comboPayload) as any;
                        created++;
                        results.push({ index, status: 'created', id: String(createdCombo._id), name });
                    } else {
                        created++;
                        results.push({ index, status: 'created', name });
                    }
                    continue;
                }

                if (!name) {
                    throw new Error('Name is required');
                }

                const price = parsePriceNumber(item.price);
                if (price === null || price < 0) {
                    throw new Error('Valid price is required');
                }

                // Resolve categoryId
                let categoryId: string | undefined = item.categoryId ? String(item.categoryId) : undefined;
                const categoryName = normalizeString(item.category);

                if (categoryId) {
                    const foundCategory = await Category.findOne({ _id: categoryId, outlet_id: outletId }).select('_id');
                    if (!foundCategory) {
                        throw new Error('categoryId does not belong to this outlet');
                    }
                } else if (categoryName) {
                    const key = categoryName.toLowerCase();
                    const existingId = categoryIdByName.get(key);
                    if (existingId) {
                        categoryId = existingId;
                    } else if (createMissingCategories) {
                        const slug = await generateUniqueCategorySlugForOutlet(outletId, categoryName);
                        if (!dryRun) {
                            const createdCategory = await Category.create({
                                outlet_id: outletId,
                                name: categoryName,
                                slug,
                                description: 'Imported category',
                                is_active: true,
                                display_order: ++categoryEncounterCount
                            });
                            categoryId = String(createdCategory._id);
                            categoryIdByName.set(key, categoryId);
                        } else {
                            // Dry-run: pretend category will exist
                            categoryId = 'dry-run-category';
                        }
                    } else {
                        throw new Error('Category not found');
                    }
                } else {
                    throw new Error('Category is required');
                }

                const key = `${name.toLowerCase()}|${price.toFixed(2)}`;
                const duplicateId = existingByKey.get(key);

                // Determine operation
                const explicitUpdateId = item.updateId ? String(item.updateId) : undefined;
                const isUpdate = parseBoolean(item.isUpdate, false);

                let operation: 'create' | 'update' | 'skip' = 'create';
                let targetId: string | undefined;

                if (isUpdate && explicitUpdateId) {
                    operation = 'update';
                    targetId = explicitUpdateId;
                } else if (duplicateId) {
                    if (onDuplicate === 'skip') {
                        operation = 'skip';
                    } else if (onDuplicate === 'update') {
                        operation = 'update';
                        targetId = duplicateId;
                    } else {
                        operation = 'create';
                    }
                }

                if (operation === 'skip') {
                    skipped++;
                    results.push({ index, status: 'skipped', name });
                    continue;
                }

                const itemType = item.itemType === 'beverage' ? 'beverage' : 'food';
                const isVeg = parseBoolean(item.isVeg, true);
                const isActive = parseBoolean(item.isActive, true);
                const isAvailable = parseBoolean(item.isAvailable, isActive);

                const variants = normalizeVariants(item.variants);
                if (item.variants !== undefined && item.variants !== null && variants === undefined) {
                    throw new Error('Invalid variants');
                }

                const payload: any = {
                    name,
                    description: normalizeString(item.description) || undefined,
                    category_id: categoryId === 'dry-run-category' ? undefined : new mongoose.Types.ObjectId(categoryId),
                    item_type: itemType,
                    is_veg: isVeg,
                    food_type: isVeg ? 'veg' : 'non-veg',
                    price,
                    tax_percentage: item.taxPercentage !== undefined ? Number(item.taxPercentage) : undefined,
                    image_url: normalizeString(item.imageUrl || item.image) || undefined,
                    is_active: isActive,
                    is_available: isAvailable,
                    tags: normalizeTags(item.tags),
                    addon_ids: Array.isArray(item.addonIds)
                        ? item.addonIds.map((a: any) => new mongoose.Types.ObjectId(String(a)))
                        : [],
                    variants: variants ?? [],
                    display_order: item.display_order ?? index + 1,
                };

                // Copy location from outlet (same as createFoodItemForOutlet)
                if (outlet.location && outlet.location.coordinates && outlet.location.coordinates.length === 2) {
                    payload.location = { type: 'Point', coordinates: outlet.location.coordinates };
                }

                if (dryRun) {
                    if (operation === 'update') updated++;
                    else created++;
                    results.push({ index, status: operation === 'update' ? 'updated' : 'created', id: targetId, name });
                    continue;
                }

                if (operation === 'update') {
                    if (!targetId) throw new Error('Missing update target id');
                    const updatedDoc = await FoodItem.findOneAndUpdate(
                        { _id: targetId, outlet_id: outletId },
                        payload,
                        { new: true }
                    );
                    if (!updatedDoc) throw new Error('Food item not found for update');
                    updated++;
                    results.push({ index, status: 'updated', id: String(updatedDoc._id), name });
                } else {
                    const createdDoc = await new FoodItem({
                        ...payload,
                        outlet_id: outletId
                    }).save();
                    created++;
                    const createdKey = `${name.toLowerCase()}|${price.toFixed(2)}`;
                    existingByKey.set(createdKey, String(createdDoc._id));
                    results.push({ index, status: 'created', id: String(createdDoc._id), name });
                }
            } catch (e: any) {
                failed++;
                errors.push({ index, name: name || undefined, message: e?.message || 'Unknown error' });
                results.push({ index, status: 'failed', name: name || undefined });
            }
        }

        return sendSuccess(res, {
            outletId,
            dryRun,
            total: items.length,
            created,
            updated,
            skipped,
            failed,
            errors,
            results
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const exportMenuForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;

        const outlet = await Outlet.findById(outletId).select('_id');
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        const [categories, items, addons, combos] = await Promise.all([
            Category.find({ outlet_id: outletId }).sort({ display_order: 1, name: 1 }),
            FoodItem.find({ outlet_id: outletId }).sort({ display_order: 1, name: 1 }),
            AddOn.find({ outlet_id: outletId }).sort({ display_order: 1, name: 1 }),
            Combo.find({ outlet_id: outletId }).sort({ display_order: 1, name: 1 })
        ]);

        const categoryNameById = new Map<string, string>();
        categories.forEach((c: any) => categoryNameById.set(String(c._id), c.name));

        return sendSuccess(res, {
            outletId,
            exportedAt: new Date().toISOString(),
            categories: categories.map((c: any) => ({
                id: String(c._id),
                name: c.name,
                slug: c.slug,
                description: c.description,
                imageUrl: c.image_url,
                sortOrder: c.display_order,
                isActive: c.is_active
            })),
            items: items.map((i: any) => ({
                id: String(i._id),
                categoryId: i.category_id ? String(i.category_id) : null,
                category: i.category_id ? categoryNameById.get(String(i.category_id)) || '' : '',
                addonIds: Array.isArray(i.addon_ids) ? i.addon_ids.map((a: any) => String(a)) : [],
                name: i.name,
                description: i.description,
                itemType: i.item_type,
                isVeg: i.is_veg,
                price: i.price,
                taxPercentage: i.tax_percentage,
                imageUrl: i.image_url,
                isActive: i.is_active,
                isAvailable: i.is_available,
                tags: i.tags || [],
                variants: Array.isArray(i.variants) ? i.variants.map((v: any) => ({ size: v.size, price: v.price })) : [],
                displayOrder: i.display_order
            })),
            addons: addons.map((a: any) => ({
                id: String(a._id),
                name: a.name,
                price: a.price,
                category: a.category,
                isActive: a.is_active,
                displayOrder: a.display_order
            })),
            combos: combos.map((c: any) => ({
                id: String(c._id),
                comboType: c.combo_type || 'offer',
                name: c.name,
                description: c.description,
                imageUrl: c.image_url,
                items: c.items || [],
                customItems: (c.custom_items || []).map((item: any) => ({
                    itemName: item.item_name,
                    itemImage: item.item_image,
                    itemQuantity: item.item_quantity
                })),
                discountPercentage: c.discount_percentage,
                originalPrice: c.original_price,
                price: c.price,
                manualPriceOverride: c.manual_price_override,
                isActive: c.is_active,
                displayOrder: c.display_order
            }))
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getMenuSyncStatusForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;

        const outlet = await Outlet.findById(outletId).select('_id');
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        const [lastItem, lastCategory, lastAddon, lastCombo] = await Promise.all([
            FoodItem.findOne({ outlet_id: outletId }).sort({ updated_at: -1 }).select('updated_at'),
            Category.findOne({ outlet_id: outletId }).sort({ updated_at: -1 }).select('updated_at'),
            AddOn.findOne({ outlet_id: outletId }).sort({ updated_at: -1 }).select('updated_at'),
            Combo.findOne({ outlet_id: outletId }).sort({ updated_at: -1 }).select('updated_at')
        ]);

        const candidates: Date[] = [];
        const toDate = (d: any) => (d ? new Date(d) : null);
        const d1 = toDate((lastItem as any)?.updated_at);
        const d2 = toDate((lastCategory as any)?.updated_at);
        const d3 = toDate((lastAddon as any)?.updated_at);
        const d4 = toDate((lastCombo as any)?.updated_at);
        if (d1) candidates.push(d1);
        if (d2) candidates.push(d2);
        if (d3) candidates.push(d3);
        if (d4) candidates.push(d4);

        const lastUpdatedAt = candidates.length > 0 ? new Date(Math.max(...candidates.map(d => d.getTime()))) : null;

        return sendSuccess(res, {
            outletId,
            lastUpdatedAt: lastUpdatedAt ? lastUpdatedAt.toISOString() : null
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

        const combosCount = await Combo.countDocuments({
            outlet_id: outletId,
            'items.food_item_id': foodItemId
        });

        const offersCount = await Offer.countDocuments({
            outlet_ids: outletId,
            applicable_food_item_ids: foodItemId
        });

        if (combosCount > 0 || offersCount > 0) {
            return sendError(
                res,
                'Cannot delete food item because it is used in combos/offers',
                { combosCount, offersCount },
                400
            );
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
            addon_ids: originalItem.addon_ids,
            variants: (originalItem as any).variants,
            preparation_time: originalItem.preparation_time,
            calories: originalItem.calories,
            spice_level: originalItem.spice_level,
            allergens: originalItem.allergens,
            is_featured: false,
            is_recommended: originalItem.is_recommended,
            discount_percentage: originalItem.discount_percentage,
            display_order: originalItem.display_order,
            price_display_type: originalItem.price_display_type
        });

        return sendSuccess(res, {
            id: duplicatedItem._id,
            categoryId: duplicatedItem.category_id ? String(duplicatedItem.category_id) : null,
            addonIds: duplicatedItem.addon_ids ? duplicatedItem.addon_ids.map((a: any) => String(a)) : [],
            name: duplicatedItem.name,
            description: duplicatedItem.description,
            itemType: duplicatedItem.item_type,
            isVeg: duplicatedItem.is_veg,
            basePrice: duplicatedItem.price,
            taxPercentage: duplicatedItem.tax_percentage,
            imageUrl: duplicatedItem.image_url,
            isActive: duplicatedItem.is_active,
            isAvailable: duplicatedItem.is_available,
            tags: duplicatedItem.tags,
            variants: Array.isArray((duplicatedItem as any).variants)
                ? (duplicatedItem as any).variants.map((v: any) => ({ size: v.size, price: v.price }))
                : [],
            preparationTime: duplicatedItem.preparation_time,
            calories: duplicatedItem.calories,
            spiceLevel: duplicatedItem.spice_level,
            allergens: duplicatedItem.allergens,
            isFeatured: duplicatedItem.is_featured,
            isRecommended: duplicatedItem.is_recommended,
            discountPercentage: duplicatedItem.discount_percentage,
            displayOrder: duplicatedItem.display_order,
            price_display_type: duplicatedItem.price_display_type
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

        const body: any = updates || {};
        const normalized: any = { ...body };

        // Normalize common key variants
        if (body.categoryId !== undefined && body.category_id === undefined) {
            normalized.category_id = body.categoryId;
            delete normalized.categoryId;
        }

        if (body.itemType !== undefined && body.item_type === undefined) {
            normalized.item_type = body.itemType;
            delete normalized.itemType;
        }

        if (body.isVeg !== undefined && body.is_veg === undefined) {
            normalized.is_veg = body.isVeg;
            delete normalized.isVeg;
        }

        if (normalized.is_veg !== undefined) {
            normalized.food_type = normalized.is_veg ? 'veg' : 'non-veg';
        }

        const rawPrice = body.price ?? body.basePrice ?? body.base_price;
        if (rawPrice !== undefined) {
            const priceNum = Number(rawPrice);
            if (!Number.isFinite(priceNum) || priceNum < 0) {
                return sendError(res, 'Invalid price', null, 400);
            }
            normalized.price = priceNum;
            delete normalized.basePrice;
            delete normalized.base_price;
        }

        if (body.imageUrl !== undefined && body.image_url === undefined) {
            normalized.image_url = body.imageUrl;
            delete normalized.imageUrl;
        }

        if (body.taxPercentage !== undefined && body.tax_percentage === undefined) {
            normalized.tax_percentage = body.taxPercentage;
            delete normalized.taxPercentage;
        }

        if (body.preparationTime !== undefined && body.preparation_time === undefined) {
            normalized.preparation_time = body.preparationTime;
            delete normalized.preparationTime;
        }

        if (body.addonIds !== undefined && body.addon_ids === undefined) {
            normalized.addon_ids = body.addonIds;
            delete normalized.addonIds;
        }

        if (body.spiceLevel !== undefined && body.spice_level === undefined) {
            normalized.spice_level = body.spiceLevel;
            delete normalized.spiceLevel;
        }

        if (body.isFeatured !== undefined && body.is_featured === undefined) {
            normalized.is_featured = body.isFeatured;
            delete normalized.isFeatured;
        }

        if (body.discountPercentage !== undefined && body.discount_percentage === undefined) {
            normalized.discount_percentage = body.discountPercentage;
            delete normalized.discountPercentage;
        }

        if (body.isRecommended !== undefined && body.is_recommended === undefined) {
            normalized.is_recommended = body.isRecommended;
            delete normalized.isRecommended;
        }

        if (body.isActive !== undefined && body.is_active === undefined) {
            normalized.is_active = body.isActive;
            delete normalized.isActive;
        }

        if (body.isAvailable !== undefined && body.is_available === undefined) {
            normalized.is_available = body.isAvailable;
            delete normalized.isAvailable;
        }

        if (body.displayOrder !== undefined && body.display_order === undefined) {
            normalized.display_order = body.displayOrder;
            delete normalized.displayOrder;
        }

        // Keep is_available aligned when toggling is_active
        if (normalized.is_active !== undefined && normalized.is_available === undefined) {
            normalized.is_available = normalized.is_active;
        }

        // Only allow a safe set of fields to be bulk-updated
        const allowedKeys = new Set([
            'name',
            'description',
            'category_id',
            'item_type',
            'is_veg',
            'food_type',
            'price',
            'tax_percentage',
            'image_url',
            'is_active',
            'is_available',
            'addon_ids',
            'tags',
            'preparation_time',
            'calories',
            'spice_level',
            'allergens',
            'is_featured',
            'is_recommended',
            'discount_percentage',
            'display_order'
        ]);

        const sanitized: any = {};
        for (const [key, value] of Object.entries(normalized)) {
            if (allowedKeys.has(key)) sanitized[key] = value;
        }

        if (Object.keys(sanitized).length === 0) {
            return sendError(res, 'No valid fields to update', 400);
        }

        // Only update items that belong to this outlet
        const result = await FoodItem.updateMany(
            { _id: { $in: itemIds }, outlet_id: outletId },
            { $set: sanitized }
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

        const comboProtected = await Combo.distinct('items.food_item_id', {
            outlet_id: outletId,
            'items.food_item_id': { $in: itemIds }
        });

        const offerProtected = await Offer.distinct('applicable_food_item_ids', {
            outlet_ids: outletId,
            applicable_food_item_ids: { $in: itemIds }
        });

        const protectedIds = Array.from(
            new Set([
                ...comboProtected.map((id: any) => String(id)),
                ...offerProtected.map((id: any) => String(id))
            ])
        );

        if (protectedIds.length > 0) {
            return sendError(
                res,
                'Cannot bulk delete: some items are used in combos/offers',
                { protectedIds },
                400
            );
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
        const { name, price, category, displayOrder, isActive } = req.body;

        if (!name) return sendError(res, 'Add-on name is required', null, 400);
        if (price === undefined || price === null || isNaN(Number(price)) || Number(price) < 0) {
            return sendError(res, 'Valid price is required', null, 400);
        }

        // Verify outlet exists
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // Add-ons are outlet-level, so use outlet_id
        const addOn: any = await AddOn.create({
            outlet_id: outletId,
            name,
            price: Number(price),
            category,
            display_order: displayOrder ?? 0,
            is_active: isActive !== false
        });

        return sendSuccess(res, {
            id: addOn._id,
            name: addOn.name,
            price: addOn.price,
            category: addOn.category,
            isActive: addOn.is_active,
            displayOrder: addOn.display_order
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

        const addOns = await AddOn.find({ outlet_id: outletId }).sort({ display_order: 1, name: 1 });

        return sendSuccess(res, addOns.map(a => ({
            id: a._id,
            name: a.name,
            price: a.price,
            category: a.category,
            isActive: a.is_active,
            displayOrder: a.display_order
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

        // Verify add-on belongs to this outlet (AddOn is outlet-scoped)
        const addOn = await AddOn.findOne({ _id: addOnId, outlet_id: outletId });
        if (!addOn) {
            return sendError(res, 'Add-on not found for this outlet', 404);
        }

        const { name, price, category, is_active, isActive, displayOrder } = req.body;
        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (price !== undefined) updates.price = price;
        if (category !== undefined) updates.category = category;
        if (is_active !== undefined) updates.is_active = is_active;
        if (isActive !== undefined) updates.is_active = isActive;
        if (displayOrder !== undefined) updates.display_order = displayOrder;

        const updatedAddOn = await AddOn.findOneAndUpdate(
            { _id: addOnId, outlet_id: outletId },
            updates,
            { new: true }
        );
        return sendSuccess(res, {
            id: updatedAddOn?._id,
            name: updatedAddOn?.name,
            price: updatedAddOn?.price,
            category: updatedAddOn?.category,
            isActive: updatedAddOn?.is_active,
            displayOrder: updatedAddOn?.display_order
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

        // Verify add-on belongs to this outlet (AddOn is outlet-scoped)
        const addOn = await AddOn.findOne({ _id: addOnId, outlet_id: outletId });
        if (!addOn) {
            return sendError(res, 'Add-on not found for this outlet', 404);
        }

        // Prevent deleting an add-on that is still referenced by items
        const itemsCount = await FoodItem.countDocuments({
            outlet_id: outletId,
            addon_ids: addOnId
        });
        if (itemsCount > 0) {
            return sendError(
                res,
                'Cannot delete this add-on because it is used by menu items. Remove it from those items first.',
                { itemsCount },
                400
            );
        }

        await AddOn.findOneAndDelete({ _id: addOnId, outlet_id: outletId });
        return sendSuccess(res, null, 'Add-on deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

// ==================== COMBOS ====================

export const createComboForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const {
            name,
            description,
            imageUrl,
            items,
            customItems, // New field for regular combos
            comboType = 'offer', // New field to distinguish combo type
            discountPercentage = 0,
            manualPriceOverride = false,
            price,
            isActive,
            displayOrder
        } = req.body;

        // Verify outlet exists
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return sendError(res, 'Combo name is required', null, 400);
        }

        // Validate combo type
        if (!['offer', 'regular'].includes(comboType)) {
            return sendError(res, 'Invalid combo type. Must be "offer" or "regular"', null, 400);
        }

        let finalPrice = 0;
        let originalPrice = 0;
        let normalizedItems: any[] = [];
        let normalizedCustomItems: any[] = [];

        if (comboType === 'offer') {
            // OFFER COMBO: Validate existing items
            if (!items || !Array.isArray(items) || items.length === 0) {
                return sendError(res, 'Offer combo must include at least one existing item', null, 400);
            }

            normalizedItems = items.map((i: any) => ({
                foodItemId: i.foodItemId ?? i.itemId,
                quantity: i.quantity
            }));

            // Calculate pricing for offer combos
            const foodItemIds = normalizedItems.map((i: any) => i.foodItemId);
            const foodItems = await FoodItem.find({ _id: { $in: foodItemIds }, outlet_id: outletId });
            const priceById = new Map(foodItems.map(fi => [fi._id.toString(), fi.price]));

            const missingIds = normalizedItems
                .map((i: any) => i.foodItemId)
                .filter((id: any) => id && !priceById.has(String(id)));
            if (missingIds.length > 0) {
                return sendError(res, 'Some combo items were not found for this outlet', { missingIds }, 400);
            }

            originalPrice = normalizedItems.reduce((sum: number, i: any) => {
                const basePrice = priceById.get(i.foodItemId) ?? 0;
                return sum + basePrice * i.quantity;
            }, 0);

            const discountedPrice = Math.max(0, originalPrice * (1 - (discountPercentage || 0) / 100));
            finalPrice = manualPriceOverride ? (price ?? discountedPrice) : discountedPrice;

        } else if (comboType === 'regular') {
            // REGULAR COMBO: Validate custom items
            if (!customItems || !Array.isArray(customItems) || customItems.length === 0) {
                return sendError(res, 'Regular combo must include at least one custom item', null, 400);
            }

            normalizedCustomItems = customItems.map((i: any) => ({
                itemName: i.itemName ?? i.item_name,
                itemImage: i.itemImage ?? i.item_image,
                itemQuantity: i.itemQuantity ?? i.item_quantity
            }));

            // Validate each custom item
            for (const item of normalizedCustomItems) {
                if (!item.itemName || typeof item.itemName !== 'string' || item.itemName.trim().length === 0) {
                    return sendError(res, 'Each custom item must have a valid name', null, 400);
                }
                if (!item.itemQuantity || item.itemQuantity < 1) {
                    return sendError(res, 'Each custom item must have a quantity of at least 1', null, 400);
                }
            }

            // For regular combos, price is mandatory and set directly
            if (!price || price <= 0) {
                return sendError(res, 'Regular combo must have a valid price', null, 400);
            }

            finalPrice = price;
            originalPrice = 0; // No original price for regular combos
        }

        // Create combo with appropriate fields based on type
        const comboData: any = {
            outlet_id: outletId,
            combo_type: comboType,
            name,
            description,
            image_url: imageUrl,
            price: finalPrice,
            display_order: displayOrder ?? 0,
            is_active: isActive !== false
        };

        if (comboType === 'offer') {
            comboData.items = normalizedItems.map((i: { foodItemId: string; quantity: number }) => ({
                food_item_id: i.foodItemId,
                quantity: i.quantity
            }));
            comboData.discount_percentage = discountPercentage;
            comboData.original_price = originalPrice;
            comboData.manual_price_override = manualPriceOverride;
        } else {
            comboData.custom_items = normalizedCustomItems.map((i: any) => ({
                item_name: i.itemName,
                item_image: i.itemImage,
                item_quantity: i.itemQuantity
            }));
            comboData.items = []; // Empty for regular combos
            comboData.discount_percentage = 0;
            comboData.original_price = 0;
            comboData.manual_price_override = false;
        }

        const combo: any = await Combo.create(comboData);

        // Format response based on combo type
        const response: any = {
            id: combo._id,
            comboType: combo.combo_type,
            name: combo.name,
            description: combo.description,
            imageUrl: combo.image_url,
            price: combo.price,
            isActive: combo.is_active,
            displayOrder: combo.display_order
        };

        if (comboType === 'offer') {
            response.items = combo.items.map((i: any) => ({ foodItemId: i.food_item_id, quantity: i.quantity }));
            response.discountPercentage = combo.discount_percentage;
            response.originalPrice = combo.original_price;
            response.manualPriceOverride = combo.manual_price_override;
        } else {
            response.customItems = combo.custom_items.map((i: any) => ({
                itemName: i.item_name,
                itemImage: i.item_image,
                itemQuantity: i.item_quantity
            }));
        }

        return sendSuccess(res, response, null, 201);
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

        const combos = await Combo.find({ outlet_id: outletId }).sort({ display_order: 1, name: 1 });

        return sendSuccess(res, combos.map(c => ({
            id: c._id,
            comboType: c.combo_type || 'offer',
            name: c.name,
            description: c.description,
            imageUrl: c.image_url,
            items: c.items.map(i => ({ foodItemId: i.food_item_id, quantity: i.quantity })),
            customItems: (c.custom_items || []).map(i => ({
                itemName: i.item_name,
                itemImage: i.item_image,
                itemQuantity: i.item_quantity
            })),
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

        // Verify combo belongs to this outlet (Combo is outlet-scoped)
        const combo = await Combo.findOne({ _id: comboId, outlet_id: outletId });
        if (!combo) {
            return sendError(res, 'Combo not found for this outlet', 404);
        }

        const {
            name,
            description,
            imageUrl,
            items,
            customItems,
            comboType,
            discountPercentage,
            manualPriceOverride,
            price,
            isActive,
            is_active
        } = req.body;

        const updates: Record<string, any> = {};
        if (name !== undefined) {
            updates.name = name;
        }
        if (description !== undefined) {
            updates.description = description;
        }
        if (imageUrl !== undefined) {
            updates.image_url = imageUrl;
        }
        if (isActive !== undefined) {
            updates.is_active = isActive;
        }
        if (is_active !== undefined) {
            updates.is_active = is_active;
        }

        // Determine the effective combo type (use existing combo type if not provided)
        const effectiveComboType = comboType || combo.combo_type || 'offer';

        if (effectiveComboType === 'regular') {
            // REGULAR COMBO UPDATE
            if (customItems !== undefined) {
                if (!Array.isArray(customItems) || customItems.length === 0) {
                    return sendError(res, 'Regular combo must include at least one custom item', null, 400);
                }

                const normalizedCustomItems = customItems.map((i: any) => ({
                    itemName: i.itemName ?? i.item_name,
                    itemImage: i.itemImage ?? i.item_image,
                    itemQuantity: i.itemQuantity ?? i.item_quantity
                }));

                // Validate each custom item
                for (const item of normalizedCustomItems) {
                    if (!item.itemName || typeof item.itemName !== 'string' || item.itemName.trim().length === 0) {
                        return sendError(res, 'Each custom item must have a valid name', null, 400);
                    }
                    if (!item.itemQuantity || item.itemQuantity < 1) {
                        return sendError(res, 'Each custom item must have a quantity of at least 1', null, 400);
                    }
                }

                updates.custom_items = normalizedCustomItems.map((i: any) => ({
                    item_name: i.itemName,
                    item_image: i.itemImage,
                    item_quantity: i.itemQuantity
                }));
            }

            // For regular combos, price is set directly
            if (price !== undefined) {
                if (price <= 0) {
                    return sendError(res, 'Regular combo must have a valid price', null, 400);
                }
                updates.price = price;
            }

            // Clear offer-specific fields for regular combos
            updates.items = [];
            updates.discount_percentage = 0;
            updates.original_price = 0;
            updates.manual_price_override = false;

        } else {
            // OFFER COMBO UPDATE (existing logic)
            if (discountPercentage !== undefined) updates.discount_percentage = discountPercentage;
            if (manualPriceOverride !== undefined) updates.manual_price_override = manualPriceOverride;

            const isItemsProvided = items !== undefined;
            const normalizedItems: Array<{ foodItemId: string; quantity: number }> = isItemsProvided
                ? (items || []).map((i: any) => ({
                    foodItemId: i.foodItemId ?? i.itemId,
                    quantity: i.quantity
                }))
                : [];

            if (isItemsProvided && normalizedItems.length === 0) {
                return sendError(res, 'Offer combo must include at least one item', null, 400);
            }

            if (isItemsProvided) {
                updates.items = normalizedItems.map((i: any) => ({
                    food_item_id: i.foodItemId,
                    quantity: i.quantity
                }));
            }

            const effectiveItems = isItemsProvided
                ? normalizedItems
                : combo.items.map((i: any) => ({
                    foodItemId: i.food_item_id?.toString(),
                    quantity: i.quantity
                }));
            const effectiveDiscount = discountPercentage !== undefined ? discountPercentage : combo.discount_percentage;
            const effectiveManualOverride = manualPriceOverride !== undefined ? manualPriceOverride : combo.manual_price_override;

            // Recalculate pricing for offer combos
            const foodItemIds = effectiveItems.map((i: any) => i.foodItemId);
            const foodItems = await FoodItem.find({ _id: { $in: foodItemIds }, outlet_id: outletId });
            const priceById = new Map(foodItems.map(fi => [fi._id.toString(), fi.price]));

            const missingIds = effectiveItems
                .map(i => i.foodItemId)
                .filter((id: any) => id && !priceById.has(String(id)));
            if (missingIds.length > 0) {
                return sendError(res, 'Some combo items were not found for this outlet', { missingIds }, 400);
            }

            const originalPrice = effectiveItems.reduce((sum: number, i: any) => {
                const basePrice = priceById.get(i.foodItemId) ?? 0;
                return sum + basePrice * i.quantity;
            }, 0);

            const discountedPrice = Math.max(0, originalPrice * (1 - (effectiveDiscount || 0) / 100));
            updates.original_price = originalPrice;
            updates.price = effectiveManualOverride ? (price ?? combo.price) : discountedPrice;

            // Clear regular combo fields
            updates.custom_items = [];
        }

        const updatedCombo = await Combo.findByIdAndUpdate(comboId, updates, { new: true });

        // Format response based on combo type
        const response: any = {
            id: updatedCombo?._id,
            comboType: updatedCombo?.combo_type,
            name: updatedCombo?.name,
            description: updatedCombo?.description,
            imageUrl: updatedCombo?.image_url,
            price: updatedCombo?.price,
            isActive: updatedCombo?.is_active
        };

        if (effectiveComboType === 'offer') {
            response.items = updatedCombo?.items.map((i: any) => ({ foodItemId: i.food_item_id, quantity: i.quantity }));
            response.discountPercentage = updatedCombo?.discount_percentage;
            response.originalPrice = updatedCombo?.original_price;
            response.manualPriceOverride = updatedCombo?.manual_price_override;
        } else {
            response.customItems = (updatedCombo?.custom_items || []).map((i: any) => ({
                itemName: i.item_name,
                itemImage: i.item_image,
                itemQuantity: i.item_quantity
            }));
        }

        return sendSuccess(res, response);
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

        // Verify combo belongs to this outlet (Combo is outlet-scoped)
        const combo = await Combo.findOne({ _id: comboId, outlet_id: outletId });
        if (!combo) {
            return sendError(res, 'Combo not found for this outlet', 404);
        }

        await Combo.findOneAndDelete({ _id: comboId, outlet_id: outletId });
        return sendSuccess(res, null, 'Combo deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

// ==================== MENU SYNC ====================

export const previewMenuSyncForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { targetOutletIds, options } = req.body;

        if (!targetOutletIds || !Array.isArray(targetOutletIds) || targetOutletIds.length === 0) {
            return sendError(res, 'Target outlet IDs are required', 400);
        }

        // Verify source outlet exists and user has access
        const sourceOutlet = await Outlet.findById(outletId);
        if (!sourceOutlet) {
            return sendError(res, 'Source outlet not found', 404);
        }

        // Get source menu data
        const [sourceItems, sourceCategories, sourceAddons, sourceCombos] = await Promise.all([
            FoodItem.find({ outlet_id: outletId }),
            Category.find({ outlet_id: outletId }),
            AddOn.find({ outlet_id: outletId }),
            Combo.find({ outlet_id: outletId })
        ]);

        // Prepare preview for each target outlet
        const targetOutlets = await Promise.all(
            targetOutletIds.map(async (targetId: string) => {
                const targetOutlet = await Outlet.findById(targetId);
                if (!targetOutlet) {
                    return null;
                }

                const [targetItems, targetCategories] = await Promise.all([
                    FoodItem.find({ outlet_id: targetId }),
                    Category.find({ outlet_id: targetId })
                ]);

                // Find duplicates
                const targetItemNames = new Set(targetItems.map(i => i.name.toLowerCase()));
                const targetCategoryNames = new Set(targetCategories.map(c => c.name.toLowerCase()));

                const duplicateItems = sourceItems
                    .filter(i => targetItemNames.has(i.name.toLowerCase()))
                    .map(i => i.name);

                const duplicateCategories = sourceCategories
                    .filter(c => targetCategoryNames.has(c.name.toLowerCase()))
                    .map(c => c.name);

                // Estimate changes
                let itemsToCreate = 0;
                let itemsToUpdate = 0;
                let categoriesToCreate = 0;
                let categoriesToUpdate = 0;

                if (options?.duplicateStrategy === 'skip') {
                    itemsToCreate = sourceItems.length - duplicateItems.length;
                } else if (options?.duplicateStrategy === 'update') {
                    itemsToCreate = sourceItems.length - duplicateItems.length;
                    itemsToUpdate = duplicateItems.length;
                } else {
                    itemsToCreate = sourceItems.length;
                }

                if (options?.categoryHandling === 'map_by_name') {
                    categoriesToUpdate = duplicateCategories.length;
                    categoriesToCreate = sourceCategories.length - duplicateCategories.length;
                } else {
                    categoriesToCreate = sourceCategories.length;
                }

                return {
                    id: targetId,
                    name: targetOutlet.name,
                    conflicts: {
                        duplicateItems,
                        duplicateCategories,
                        missingAddons: []
                    },
                    estimatedChanges: {
                        itemsToCreate,
                        itemsToUpdate,
                        categoriesToCreate,
                        categoriesToUpdate
                    }
                };
            })
        );

        return sendSuccess(res, {
            sourceOutlet: {
                id: outletId,
                name: sourceOutlet.name,
                itemCount: sourceItems.length,
                categoryCount: sourceCategories.length,
                addonCount: sourceAddons.length,
                comboCount: sourceCombos.length
            },
            targetOutlets: targetOutlets.filter(t => t !== null)
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const syncMenuToOutlets = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { targetOutletIds, options } = req.body;

        if (!targetOutletIds || !Array.isArray(targetOutletIds) || targetOutletIds.length === 0) {
            return sendError(res, 'Target outlet IDs are required', 400);
        }

        const startTime = Date.now();

        // Verify source outlet
        const sourceOutlet = await Outlet.findById(outletId);
        if (!sourceOutlet) {
            return sendError(res, 'Source outlet not found', 404);
        }

        // Get source menu data based on options
        const sourceData: any = {};

        if (options?.syncItems) {
            sourceData.items = await FoodItem.find({ outlet_id: outletId });
        }
        if (options?.syncCategories) {
            sourceData.categories = await Category.find({ outlet_id: outletId });
        }
        if (options?.syncAddons) {
            sourceData.addons = await AddOn.find({ outlet_id: outletId });
        }
        if (options?.syncCombos) {
            sourceData.combos = await Combo.find({ outlet_id: outletId });
        }

        // Sync to each target outlet
        const results = await Promise.all(
            targetOutletIds.map(async (targetId: string) => {
                try {
                    const targetOutlet = await Outlet.findById(targetId);
                    if (!targetOutlet) {
                        return {
                            outletId: targetId,
                            outletName: 'Unknown',
                            status: 'failed' as const,
                            itemsSynced: 0,
                            categoriesSynced: 0,
                            addonsSynced: 0,
                            combosSynced: 0,
                            errors: [{ type: 'outlet', message: 'Outlet not found' }]
                        };
                    }

                    let itemsSynced = 0;
                    let categoriesSynced = 0;
                    let addonsSynced = 0;
                    let combosSynced = 0;
                    const errors: any[] = [];

                    // Sync categories first (items depend on them)
                    const categoryIdMap = new Map<string, string>();

                    if (options?.syncCategories && sourceData.categories) {
                        for (const sourceCategory of sourceData.categories) {
                            try {
                                const existingCategory = await Category.findOne({
                                    outlet_id: targetId,
                                    name: sourceCategory.name
                                });

                                if (existingCategory && options?.categoryHandling === 'map_by_name') {
                                    // Use existing category (still count as synced since we're mapping it)
                                    categoryIdMap.set(sourceCategory._id.toString(), existingCategory._id.toString());
                                    categoriesSynced++;
                                } else {
                                    // Create new category
                                    const newCategory = await Category.create({
                                        outlet_id: targetId,
                                        name: sourceCategory.name,
                                        description: sourceCategory.description,
                                        image_url: sourceCategory.image_url,
                                        display_order: sourceCategory.display_order,
                                        is_active: sourceCategory.is_active,
                                        slug: await generateUniqueCategorySlugForOutlet(targetId, sourceCategory.name)
                                    });
                                    categoryIdMap.set(sourceCategory._id.toString(), newCategory._id.toString());
                                    categoriesSynced++;
                                }
                            } catch (err: any) {
                                errors.push({ type: 'category', message: `Failed to sync category ${sourceCategory.name}: ${err.message}` });
                            }
                        }
                    }

                    // Sync add-ons
                    const addonIdMap = new Map<string, string>();

                    if (options?.syncAddons && sourceData.addons) {
                        for (const sourceAddon of sourceData.addons) {
                            try {
                                const existingAddon = await AddOn.findOne({
                                    outlet_id: targetId,
                                    name: sourceAddon.name
                                });

                                if (existingAddon && options?.duplicateStrategy === 'skip') {
                                    addonIdMap.set(sourceAddon._id.toString(), existingAddon._id.toString());
                                    addonsSynced++; // Count as synced (mapped to existing)
                                } else if (existingAddon && options?.duplicateStrategy === 'update') {
                                    await AddOn.findByIdAndUpdate(existingAddon._id, {
                                        price: sourceAddon.price,
                                        category: sourceAddon.category,
                                        is_active: sourceAddon.is_active
                                    });
                                    addonIdMap.set(sourceAddon._id.toString(), existingAddon._id.toString());
                                    addonsSynced++;
                                } else {
                                    const newAddon = await AddOn.create({
                                        outlet_id: targetId,
                                        name: sourceAddon.name,
                                        price: sourceAddon.price,
                                        category: sourceAddon.category,
                                        is_active: sourceAddon.is_active
                                    });
                                    addonIdMap.set(sourceAddon._id.toString(), newAddon._id.toString());
                                    addonsSynced++;
                                }
                            } catch (err: any) {
                                errors.push({ type: 'addon', message: `Failed to sync addon ${sourceAddon.name}: ${err.message}` });
                            }
                        }
                    }

                    // Sync items
                    if (options?.syncItems && sourceData.items) {
                        for (const sourceItem of sourceData.items) {
                            try {
                                const existingItem = await FoodItem.findOne({
                                    outlet_id: targetId,
                                    name: sourceItem.name
                                });

                                if (existingItem && options?.duplicateStrategy === 'skip') {
                                    continue;
                                }

                                // Map category ID
                                const targetCategoryId = sourceItem.category_id
                                    ? categoryIdMap.get(sourceItem.category_id.toString())
                                    : null;

                                // Map addon IDs
                                const targetAddonIds = (sourceItem.addon_ids || [])
                                    .map((id: any) => addonIdMap.get(id.toString()))
                                    .filter((id: any) => id !== undefined);

                                // Apply price adjustment
                                let price = sourceItem.price;
                                if (options?.priceAdjustment) {
                                    price = price * (1 + options.priceAdjustment / 100);
                                }

                                // Determine availability
                                let isAvailable = sourceItem.is_available;
                                if (options?.availabilityMode === 'all_available') {
                                    isAvailable = true;
                                } else if (options?.availabilityMode === 'all_unavailable') {
                                    isAvailable = false;
                                }

                                const itemData: any = {
                                    outlet_id: targetId,
                                    name: sourceItem.name,
                                    description: sourceItem.description,
                                    item_type: sourceItem.item_type,
                                    food_type: sourceItem.food_type,
                                    is_veg: sourceItem.is_veg,
                                    is_active: isAvailable,
                                    is_available: isAvailable,
                                    price,
                                    tax_percentage: sourceItem.tax_percentage,
                                    image_url: sourceItem.image_url,
                                    tags: sourceItem.tags,
                                    addon_ids: targetAddonIds,
                                    variants: sourceItem.variants,
                                    preparation_time: sourceItem.preparation_time,
                                    calories: sourceItem.calories,
                                    spice_level: sourceItem.spice_level,
                                    allergens: sourceItem.allergens,
                                    is_featured: sourceItem.is_featured,
                                    is_recommended: sourceItem.is_recommended,
                                    discount_percentage: sourceItem.discount_percentage
                                };

                                // Only add category_id if it exists
                                if (targetCategoryId) {
                                    itemData.category_id = targetCategoryId;
                                }

                                if (existingItem && options?.duplicateStrategy === 'update') {
                                    await FoodItem.findByIdAndUpdate(existingItem._id, itemData);
                                } else {
                                    await FoodItem.create(itemData);
                                }
                                itemsSynced++;
                            } catch (err: any) {
                                errors.push({ type: 'item', message: `Failed to sync item ${sourceItem.name}: ${err.message}` });
                            }
                        }
                    }

                    return {
                        outletId: targetId,
                        outletName: targetOutlet.name,
                        status: (errors.length === 0 ? 'success' : (itemsSynced > 0 || categoriesSynced > 0 ? 'partial' : 'failed')) as 'success' | 'failed' | 'partial',
                        itemsSynced,
                        categoriesSynced,
                        addonsSynced,
                        combosSynced,
                        errors
                    };
                } catch (err: any) {
                    return {
                        outletId: targetId,
                        outletName: 'Unknown',
                        status: 'failed' as const,
                        itemsSynced: 0,
                        categoriesSynced: 0,
                        addonsSynced: 0,
                        combosSynced: 0,
                        errors: [{ type: 'general', message: err.message }]
                    };
                }
            })
        );

        const totalTime = Date.now() - startTime;
        const allSuccess = results.every(r => r.status === 'success');

        return sendSuccess(res, {
            success: allSuccess,
            results,
            totalTime
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getMenuSyncHistoryForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;

        // Verify outlet exists
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // For now, return empty history
        // In a production system, you'd store sync operations in a SyncHistory collection
        return sendSuccess(res, []);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};
