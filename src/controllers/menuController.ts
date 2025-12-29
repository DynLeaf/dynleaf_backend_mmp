import { Request, Response } from 'express';
import { Category } from '../models/Category.js';
import { FoodItem } from '../models/FoodItem.js';
import { Menu } from '../models/Menu.js';
import { FoodVariant } from '../models/FoodVariant.js';
import { AddOn } from '../models/AddOn.js';
import { Combo } from '../models/Combo.js';
import { Outlet } from '../models/Outlet.js';
import { sendSuccess, sendError } from '../utils/response.js';

const computeComboPricing = async (items: Array<{ foodItemId: string; quantity: number }>, discountPercentage: number) => {
    const foodItemIds = items.map(i => i.foodItemId);
    const foodItems = await FoodItem.find({ _id: { $in: foodItemIds } });
    const priceById = new Map(foodItems.map(fi => [fi._id.toString(), fi.base_price]));

    const originalPrice = items.reduce((sum, i) => {
        const basePrice = priceById.get(i.foodItemId) ?? 0;
        return sum + basePrice * i.quantity;
    }, 0);

    const discountedPrice = Math.max(0, originalPrice * (1 - (discountPercentage || 0) / 100));
    return { originalPrice, discountedPrice };
};

export const createCategory = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { name, description, imageUrl, isActive } = req.body;

        const category = await Category.create({
            brand_id: brandId,
            name,
            description,
            image_url: imageUrl,
            is_active: isActive
        });

        return sendSuccess(res, { id: category._id, name: category.name, isActive: category.is_active }, null, 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const listCategories = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const categories = await Category.find({ brand_id: brandId });
        return sendSuccess(res, categories.map(c => ({ id: c._id, name: c.name, isActive: c.is_active })));
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const updateCategory = async (req: Request, res: Response) => {
    try {
        const { categoryId } = req.params;
        const category = await Category.findByIdAndUpdate(categoryId, req.body, { new: true });
        return sendSuccess(res, { id: category?._id, name: category?.name, isActive: category?.is_active });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const createFoodItem = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { name, description, categoryId, itemType, isVeg, basePrice, taxPercentage, imageUrl, isActive, addonIds } = req.body;

       
        const foodItem = await FoodItem.create({
            brand_id: brandId,
            category_id: categoryId,
            name,
            description,
            item_type: itemType || 'food',
            is_veg: isVeg,
            base_price: basePrice,
            tax_percentage: taxPercentage,
            image_url: imageUrl,
            is_active: isActive,
            addon_ids: addonIds
        });

        
        return sendSuccess(res, { id: foodItem._id, categoryId: foodItem.category_id, addonIds: foodItem.addon_ids, name: foodItem.name, itemType: foodItem.item_type, isVeg: foodItem.is_veg, basePrice: foodItem.base_price, isActive: foodItem.is_active }, null, 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const listFoodItems = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { search, category, tags, isVeg, isActive, itemType, page = '1', limit = '50', sortBy = 'created_at', sortOrder = 'desc' } = req.query;

        const query: any = { brand_id: brandId };
        
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
            basePrice: i.base_price,
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

export const updateFoodItem = async (req: Request, res: Response) => {
    try {
        const { foodItemId } = req.params;
        const item = await FoodItem.findByIdAndUpdate(foodItemId, req.body, { new: true });
        return sendSuccess(res, { id: item?._id, name: item?.name, isVeg: item?.is_veg, basePrice: item?.base_price, isActive: item?.is_active });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const createVariant = async (req: Request, res: Response) => {
    try {
        const { foodItemId } = req.params;
        const variant = await FoodVariant.create({ ...req.body, food_item_id: foodItemId }) as any;
        return sendSuccess(res, { id: variant._id, name: variant.name, priceDelta: variant.price_delta, isActive: variant.is_active }, null, 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const updateVariant = async (req: Request, res: Response) => {
    try {
        const { variantId } = req.params;
        const variant = await FoodVariant.findByIdAndUpdate(variantId, req.body, { new: true });
        return sendSuccess(res, { id: variant?._id, name: variant?.name, priceDelta: variant?.price_delta, isActive: variant?.is_active });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const createMenu = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { name, isDefault } = req.body;

        const menu = await Menu.create({
            brand_id: brandId,
            name,
            is_default: isDefault
        });

        return sendSuccess(res, { id: menu._id, name: menu.name, isDefault: menu.is_default, isActive: menu.is_active }, null, 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const listMenus = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const menus = await Menu.find({ brand_id: brandId });
        return sendSuccess(res, menus.map(m => ({ id: m._id, name: m.name, isDefault: m.is_default, isActive: m.is_active })));
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const updateMenuStructure = async (req: Request, res: Response) => {
    try {
        const { menuId } = req.params;
        const { categories } = req.body;

        await Menu.findByIdAndUpdate(menuId, { categories });

        return sendSuccess(res, null, 'Menu structure updated');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const deleteFoodItem = async (req: Request, res: Response) => {
    try {
        const { foodItemId } = req.params;
        await FoodItem.findByIdAndDelete(foodItemId);
        return sendSuccess(res, null, 'Food item deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const deleteCategory = async (req: Request, res: Response) => {
    try {
        const { categoryId } = req.params;
        await Category.findByIdAndDelete(categoryId);
        return sendSuccess(res, null, 'Category deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const duplicateFoodItem = async (req: Request, res: Response) => {
    try {
        const { foodItemId } = req.params;
        const originalItem = await FoodItem.findById(foodItemId);
        
        if (!originalItem) {
            return sendError(res, 'Food item not found', 404);
        }

        const duplicatedItem = await FoodItem.create({
            brand_id: originalItem.brand_id,
            category_id: originalItem.category_id,
            name: `${originalItem.name} (Copy)`,
            description: originalItem.description,
            is_veg: originalItem.is_veg,
            is_active: originalItem.is_active,
            base_price: originalItem.base_price,
            tax_percentage: originalItem.tax_percentage,
            image_url: originalItem.image_url,
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
            basePrice: duplicatedItem.base_price,
            isActive: duplicatedItem.is_active
        }, 'Food item duplicated successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const bulkUpdateFoodItems = async (req: Request, res: Response) => {
    try {
        const { itemIds, updates } = req.body;

        console.log('Bulk update request:', { itemIds, updates });

        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return sendError(res, 'Item IDs are required', 400);
        }

        if (!updates || typeof updates !== 'object') {
            return sendError(res, 'Updates object is required', 400);
        }

        const result = await FoodItem.updateMany(
            { _id: { $in: itemIds } },
            { $set: updates }
        );

        console.log('Bulk update result:', result);

        return sendSuccess(res, null, `${itemIds.length} items updated successfully`);
    } catch (error: any) {
        console.error('Bulk update error:', error);
        return sendError(res, error.message);
    }
};

export const bulkDeleteFoodItems = async (req: Request, res: Response) => {
    try {
        const { itemIds } = req.body;

        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return sendError(res, 'Item IDs are required', 400);
        }

        await FoodItem.deleteMany({ _id: { $in: itemIds } });

        return sendSuccess(res, null, `${itemIds.length} items deleted successfully`);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const uploadFoodItemImage = async (req: Request, res: Response) => {
    try {
        const { foodItemId } = req.params;
        const { image } = req.body;

        if (!image) {
            return sendError(res, 'Image data is required', 400);
        }

        // Use existing file upload utility
        const { saveBase64Image } = await import('../utils/fileUpload.js');
        const imagePath = await saveBase64Image(image, 'menu');

        const item = await FoodItem.findByIdAndUpdate(
            foodItemId,
            { image_url: imagePath },
            { new: true }
        );

        return sendSuccess(res, { imageUrl: imagePath }, 'Image uploaded successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const createAddOn = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { name, price, category, isActive } = req.body;

        const addOn = await AddOn.create({
            brand_id: brandId,
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

export const listAddOns = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const addOns = await AddOn.find({ brand_id: brandId });

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

export const updateAddOn = async (req: Request, res: Response) => {
    try {
        const { addOnId } = req.params;
        const addOn = await AddOn.findByIdAndUpdate(addOnId, req.body, { new: true });
        return sendSuccess(res, {
            id: addOn?._id,
            name: addOn?.name,
            price: addOn?.price,
            category: addOn?.category,
            isActive: addOn?.is_active
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const deleteAddOn = async (req: Request, res: Response) => {
    try {
        const { addOnId } = req.params;
        await AddOn.findByIdAndDelete(addOnId);
        return sendSuccess(res, null, 'Add-on deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const createCombo = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const {
            name,
            description,
            imageUrl,
            items,
            discountPercentage = 0,
            manualPriceOverride = false,
            price,
            isActive
        } = req.body;

        const normalizedItems = (items || []).map((i: any) => ({
            foodItemId: i.foodItemId ?? i.itemId,
            quantity: i.quantity
        }));

        const { originalPrice, discountedPrice } = await computeComboPricing(normalizedItems, discountPercentage);
        const finalPrice = manualPriceOverride ? (price ?? discountedPrice) : discountedPrice;

        const combo = await Combo.create({
            brand_id: brandId,
            name,
            description,
            image_url: imageUrl,
            items: normalizedItems.map((i: { foodItemId: string; quantity: number }) => ({
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

export const listCombos = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const combos = await Combo.find({ brand_id: brandId });

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

export const updateCombo = async (req: Request, res: Response) => {
    try {
        const { comboId } = req.params;

        const {
            name,
            description,
            imageUrl,
            items,
            discountPercentage,
            manualPriceOverride,
            price,
            isActive
        } = req.body;

        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (imageUrl !== undefined) updates.image_url = imageUrl;
        if (discountPercentage !== undefined) updates.discount_percentage = discountPercentage;
        if (manualPriceOverride !== undefined) updates.manual_price_override = manualPriceOverride;
        if (isActive !== undefined) updates.is_active = isActive;

        const existing = await Combo.findById(comboId);
        if (!existing) {
            return sendError(res, 'Combo not found', 404);
        }

        const isItemsProvided = items !== undefined;
        const normalizedItems: Array<{ foodItemId: string; quantity: number }> = isItemsProvided
            ? (items || []).map((i: any) => ({
                foodItemId: i.foodItemId ?? i.itemId,
                quantity: i.quantity
            }))
            : [];

        if (isItemsProvided) {
            updates.items = normalizedItems.map((i: { foodItemId: string; quantity: number }) => ({
                food_item_id: i.foodItemId,
                quantity: i.quantity
            }));
        }

        const effectiveItems = isItemsProvided
            ? normalizedItems
            : existing.items.map((i: any) => ({
                foodItemId: i.food_item_id.toString(),
                quantity: i.quantity
            }));
        const effectiveDiscount = discountPercentage !== undefined ? discountPercentage : existing.discount_percentage;
        const effectiveManualOverride = manualPriceOverride !== undefined ? manualPriceOverride : existing.manual_price_override;

        const { originalPrice, discountedPrice } = await computeComboPricing(effectiveItems, effectiveDiscount);
        updates.original_price = originalPrice;
        updates.price = effectiveManualOverride ? (price ?? existing.price) : discountedPrice;

        const combo = await Combo.findByIdAndUpdate(comboId, updates, { new: true });

        return sendSuccess(res, {
            id: combo?._id,
            name: combo?.name,
            description: combo?.description,
            imageUrl: combo?.image_url,
            items: combo?.items.map((i: any) => ({ foodItemId: i.food_item_id, quantity: i.quantity })),
            discountPercentage: combo?.discount_percentage,
            originalPrice: combo?.original_price,
            price: combo?.price,
            manualPriceOverride: combo?.manual_price_override,
            isActive: combo?.is_active
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const deleteCombo = async (req: Request, res: Response) => {
    try {
        const { comboId } = req.params;
        await Combo.findByIdAndDelete(comboId);
        return sendSuccess(res, null, 'Combo deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

// Get trending dishes based on location
export const getTrendingDishes = async (req: Request, res: Response) => {
    try {
        const { latitude, longitude, limit = 20, radius = 10000 } = req.query;
        
        if (!latitude || !longitude) {
            return sendError(res, 'Latitude and longitude are required', null, 400);
        }

        const lat = parseFloat(latitude as string);
        const lng = parseFloat(longitude as string);
        const limitNum = parseInt(limit as string);
        const radiusNum = parseInt(radius as string); // radius in meters

        // Step 1: Find nearby outlets using $geoNear
        // Use collection directly to avoid Mongoose middleware
        const nearbyOutlets = await Outlet.collection.aggregate([
            {
                $geoNear: {
                    near: {
                        type: 'Point',
                        coordinates: [lng, lat]
                    },
                    distanceField: 'distance',
                    maxDistance: radiusNum,
                    spherical: true,
                    query: {
                        is_active: true
                    }
                }
            },
            {
                $lookup: {
                    from: 'brands',
                    localField: 'brand_id',
                    foreignField: '_id',
                    as: 'brand'
                }
            },
            {
                $unwind: '$brand'
            },
            {
                $match: {
                    'brand.verification_status': 'approved',
                    $or: [
                        { 'brand.is_active': true },
                        { 'brand.is_active': { $exists: false } }
                    ]
                }
            },
            {
                $project: {
                    _id: 1,
                    brand_id: 1,
                    distance: 1,
                    'brand.name': 1,
                    'brand.logo_url': 1
                }
            },
            {
                $limit: 50 // Get up to 50 nearby outlets
            }
        ]).toArray();

        if (nearbyOutlets.length === 0) {
            return sendSuccess(res, { dishes: [] });
        }

        // Step 2: Get brand IDs from nearby outlets
        const brandIds = [...new Set(nearbyOutlets.map(outlet => outlet.brand_id))];

        // Step 3: Find trending dishes from these brands
        // For now, sort by created_at (newest first)
        // In production, you'd use metrics like order count, ratings, etc.
        const foodItems = await FoodItem.find({ 
            brand_id: { $in: brandIds },
            is_active: true 
        })
        .populate('brand_id', 'name logo_url')
        .populate('category_id', 'name')
        .sort({ created_at: -1 }) // Sort by newest - can be changed to popularity metric
        .limit(limitNum)
        .lean();

        // Step 4: Format response with outlet information
        const formattedItems = foodItems.map(item => {
            const outlet = nearbyOutlets.find(o => o.brand_id.toString() === (item.brand_id as any)._id.toString());
            
            return {
                id: item._id,
                name: item.name,
                description: item.description,
                image: item.image_url,
                price: item.base_price,
                isVeg: item.is_veg,
                rating: 4.5, // Placeholder - calculate from reviews
                restaurant: {
                    id: (item.brand_id as any)?._id,
                    name: (item.brand_id as any)?.name,
                    logo: (item.brand_id as any)?.logo_url
                },
                outlet: {
                    id: outlet?._id,
                    distance: outlet?.distance ? Math.round(outlet.distance) : null
                },
                category: (item.category_id as any)?.name
            };
        });

        return sendSuccess(res, { 
            dishes: formattedItems,
            metadata: {
                nearbyOutletsCount: nearbyOutlets.length,
                radius: radiusNum
            }
        });
    } catch (error: any) {
        console.error('getTrendingDishes error:', error);
        return sendError(res, error.message);
    }
};

