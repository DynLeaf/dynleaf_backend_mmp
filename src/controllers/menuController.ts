import { Request, Response } from 'express';
import { Category } from '../models/Category.js';
import { FoodItem } from '../models/FoodItem.js';
import { FoodVariant } from '../models/FoodVariant.js';
import { AddOn } from '../models/AddOn.js';
import { Combo } from '../models/Combo.js';
import { Outlet } from '../models/Outlet.js';
import { sendSuccess, sendError } from '../utils/response.js';

const computeComboPricing = async (items: Array<{ foodItemId: string; quantity: number }>, discountPercentage: number) => {
    const foodItemIds = items.map(i => i.foodItemId);
    const foodItems = await FoodItem.find({ _id: { $in: foodItemIds } });
    const priceById = new Map(foodItems.map(fi => [fi._id.toString(), fi.price]));

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

        // Get the first outlet for this brand
        const outlet = await Outlet.findOne({ brand_id: brandId, status: 'ACTIVE' });
        if (!outlet) {
            return sendError(res, 'No active outlet found for this brand. Please create an outlet first.', 404);
        }

        // Generate slug from name
        const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        let slug = baseSlug;
        let counter = 1;

        // Ensure slug is unique for this outlet
        while (await Category.findOne({ outlet_id: outlet._id, slug })) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        const category = await Category.create({
            outlet_id: outlet._id,
            name,
            slug,
            description,
            image_url: imageUrl,
            is_active: isActive ?? true
        });

        return sendSuccess(res, { id: category._id, name: category.name, slug: category.slug, isActive: category.is_active }, null, 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const listCategories = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;

        // Get the first outlet for this brand
        const outlet = await Outlet.findOne({ brand_id: brandId, status: 'ACTIVE' });
        if (!outlet) {
            return sendSuccess(res, []); // Return empty array if no outlet
        }

        const categories = await Category.find({ outlet_id: outlet._id });
        return sendSuccess(res, categories.map(c => ({ id: c._id, name: c.name, slug: c.slug, isActive: c.is_active })));
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

        // Get the first outlet for this brand
        const outlet = await Outlet.findOne({ brand_id: brandId, status: 'ACTIVE' });
        if (!outlet) {
            return sendError(res, 'No active outlet found for this brand. Please create an outlet first.', 404);
        }

        // Determine food_type from isVeg
        const foodType = isVeg ? 'veg' : 'non-veg';

        // Prepare food item data
        const foodItemData: any = {
            outlet_id: outlet._id,
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

        // Avoid `Model.create()` overload ambiguity when the input is typed `any`.
        const foodItem = await new FoodItem(foodItemData).save();


        return sendSuccess(res, { id: foodItem._id, categoryId: foodItem.category_id, addonIds: foodItem.addon_ids, name: foodItem.name, itemType: foodItem.item_type, isVeg: foodItem.is_veg, basePrice: foodItem.price, isActive: foodItem.is_active }, null, 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const listFoodItems = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { search, category, tags, isVeg, isActive, itemType, page = '1', limit = '50', sortBy = 'created_at', sortOrder = 'desc' } = req.query;

        // Get the first outlet for this brand
        const outlet = await Outlet.findOne({ brand_id: brandId, status: 'ACTIVE' });
        if (!outlet) {
            return sendSuccess(res, { items: [], pagination: { page: 1, limit: 50, total: 0, pages: 0 } });
        }

        const query: any = { outlet_id: outlet._id };

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

export const updateFoodItem = async (req: Request, res: Response) => {
    try {
        const { foodItemId } = req.params;
        const item = await FoodItem.findByIdAndUpdate(foodItemId, req.body, { new: true });
        return sendSuccess(res, { id: item?._id, name: item?.name, isVeg: item?.is_veg, basePrice: item?.price, isActive: item?.is_active });
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
        const { image, imageUrl, url } = req.body as { image?: string; imageUrl?: string; url?: string };

        const input = imageUrl || url || image;

        if (!input || typeof input !== 'string') {
            return sendError(res, 'Image data is required', 400);
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

export const createAddOn = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { name, price, category, isActive } = req.body;

        const outlet = await Outlet.findOne({ brand_id: brandId, status: 'ACTIVE' });
        if (!outlet) {
            return sendError(res, 'No active outlet found for this brand. Please create an outlet first.', 404);
        }

        const addOn = await AddOn.create({
            outlet_id: outlet._id,
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

        const outlet = await Outlet.findOne({ brand_id: brandId, status: 'ACTIVE' });
        if (!outlet) {
            return sendSuccess(res, []);
        }

        const addOns = await AddOn.find({ outlet_id: outlet._id });

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

        const outlet = await Outlet.findOne({ brand_id: brandId, status: 'ACTIVE' });
        if (!outlet) {
            return sendError(res, 'No active outlet found for this brand. Please create an outlet first.', 404);
        }

        const combo = await Combo.create({
            outlet_id: outlet._id,
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

        const outlet = await Outlet.findOne({ brand_id: brandId, status: 'ACTIVE' });
        if (!outlet) {
            return sendSuccess(res, []);
        }

        const combos = await Combo.find({ outlet_id: outlet._id });

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
        const { latitude, longitude, limit = 20, page = 1, radius = 50000 } = req.query;

        if (!latitude || !longitude) {
            return sendError(res, 'Latitude and longitude are required', null, 400);
        }

        const lat = parseFloat(latitude as string);
        const lng = parseFloat(longitude as string);
        const pageNum = parseInt(page as string) || 1;
        const limitNum = parseInt(limit as string) || 20;
        const skip = (pageNum - 1) * limitNum;
        const radiusNum = parseInt(radius as string) || 50000; // Default 50km to capture wide area

        console.log(`🔥 Trending: [${lat}, ${lng}], Rad: ${radiusNum}m, Page: ${pageNum}`);

        const pipeline: any[] = [
            // 1. GeoNear: Find candidates within max radius
            {
                $geoNear: {
                    near: { type: 'Point', coordinates: [lng, lat] },
                    distanceField: 'distance',
                    maxDistance: radiusNum,
                    query: { is_active: true, is_available: true },
                    spherical: true
                }
            },
            // 2. Calculate Signals: Net Votes & Distance Bucket
            {
                $addFields: {
                    net_votes: {
                        $subtract: [
                            { $ifNull: ['$upvote_count', 0] },
                            { $ifNull: ['$downvote_count', 0] }
                        ]
                    },
                    // Bucketize distance into 10km chunks (0-10km=0, 10-20km=1)
                    distance_bucket: {
                        $floor: { $divide: ['$distance', 10000] }
                    }
                }
            },
            // 3. Join with Outlet to ensure Active/Approved
            {
                $lookup: {
                    from: 'outlets',
                    localField: 'outlet_id',
                    foreignField: '_id',
                    as: 'outlet'
                }
            },
            { $unwind: '$outlet' },
            {
                $match: {
                    'outlet.status': 'ACTIVE',
                    'outlet.approval_status': 'APPROVED'
                }
            },
            // 4. Sort: Nearest Bucket -> High Votes -> High Views
            {
                $sort: {
                    distance_bucket: 1, // Priority 1: Distance Chunks
                    net_votes: -1,      // Priority 2: Popularity (Sentiment)
                    view_count: -1      // Priority 3: Popularity (Visibility)
                }
            },
            // 5. Faceted Pagination
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [
                        { $skip: skip },
                        { $limit: limitNum },
                        // Populate details only for the page we return
                        {
                            $lookup: {
                                from: 'categories',
                                localField: 'category_id',
                                foreignField: '_id',
                                as: 'category'
                            }
                        },
                        {
                            $unwind: { path: '$category', preserveNullAndEmptyArrays: true }
                        },
                        {
                            $lookup: {
                                from: 'brands',
                                localField: 'outlet.brand_id',
                                foreignField: '_id',
                                as: 'brand'
                            }
                        },
                        {
                            $unwind: { path: '$brand', preserveNullAndEmptyArrays: true }
                        }
                    ]
                }
            }
        ];

        const result = await FoodItem.aggregate(pipeline);
        const metadata = result[0].metadata[0] || { total: 0 };
        const dishes = result[0].data || [];

        console.log(`🍽️ Returned ${dishes.length} trending dishes (Total: ${metadata.total})`);

        const formattedItems = dishes.map((item: any) => ({
            id: item._id,
            name: item.name,
            description: item.description,
            image: item.image_url,
            price: item.price,
            isVeg: item.is_veg,
            rating: item.avg_rating || 4.5,
            stats: {
                netVotes: item.net_votes,
                views: item.view_count || 0,
                orders: item.order_count || 0
            },
            restaurant: {
                id: item.brand?._id,
                name: item.brand?.name || item.outlet?.name,
                logo: item.brand?.logo_url || item.outlet?.media?.cover_image_url
            },
            outlet: {
                id: item.outlet._id,
                name: item.outlet.name,
                distance: Math.round(item.distance),
                bucket: item.distance_bucket
            },
            category: item.category?.name
        }));

        return sendSuccess(res, {
            dishes: formattedItems,
            metadata: {
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: metadata.total,
                    totalPages: Math.ceil(metadata.total / limitNum)
                },
                searchRadius: radiusNum,
                strategy: 'bucket_score_optimized'
            }
        });

    } catch (error: any) {
        console.error('getTrendingDishes error:', error);
        return sendError(res, error.message);
    }
};

export const getFoodItemById = async (req: Request, res: Response) => {
    try {
        const { foodItemId } = req.params;
        const item = await FoodItem.findById(foodItemId)
            .populate('category_id')
            .lean();

        if (!item) {
            return sendError(res, 'Food item not found', 404);
        }

        const outlet: any = await Outlet.findById(item.outlet_id).populate('brand_id').lean();

        const mappedItem = {
            id: item._id,
            categoryId: item.category_id ? (item.category_id as any)._id : null,
            category: item.category_id ? (item.category_id as any).name : null,
            name: item.name,
            description: item.description,
            itemType: item.item_type,
            foodType: item.food_type,
            isVeg: item.is_veg,
            basePrice: item.price,
            price: item.price,
            taxPercentage: item.tax_percentage,
            imageUrl: item.image_url,
            isActive: item.is_active,
            tags: item.tags || [],
            preparationTime: item.preparation_time,
            calories: item.calories,
            spiceLevel: item.spice_level,
            allergens: item.allergens,
            isFeatured: item.is_featured,
            discountPercentage: item.discount_percentage,
            rating: (item as any).avg_rating || 4.5,
            totalReviews: (item as any).total_reviews || 0,
            upvote_count: item.upvote_count || 0,
            view_count: item.view_count || 0,
            order_count: item.order_count || 0,
            restaurant: {
                id: outlet?.brand_id?._id,
                name: outlet?.brand_id?.name || outlet?.name,
                logo: outlet?.brand_id?.logo_url || outlet?.media?.cover_image_url
            },
            outlet: {
                id: outlet?._id,
                name: outlet?.name,
                location: outlet?.location,
                address: outlet?.address?.full_address || outlet?.address?.street
            }
        };

        return sendSuccess(res, mappedItem);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

