import { Request, Response } from 'express';
import { Category } from '../models/Category.js';
import { FoodItem } from '../models/FoodItem.js';
import { Menu } from '../models/Menu.js';
import { FoodVariant } from '../models/FoodVariant.js';
import { sendSuccess, sendError } from '../utils/response.js';

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
        const { name, description, categoryId, isVeg, basePrice, taxPercentage, imageUrl, isActive } = req.body;

       
        const foodItem = await FoodItem.create({
            brand_id: brandId,
            category_id: categoryId,
            name,
            description,
            is_veg: isVeg,
            base_price: basePrice,
            tax_percentage: taxPercentage,
            image_url: imageUrl,
            is_active: isActive
        });

        
        return sendSuccess(res, { id: foodItem._id, categoryId: foodItem.category_id, name: foodItem.name, isVeg: foodItem.is_veg, basePrice: foodItem.base_price, isActive: foodItem.is_active }, null, 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const listFoodItems = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { search, category, tags, isVeg, isActive, page = '1', limit = '50', sortBy = 'created_at', sortOrder = 'desc' } = req.query;

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
            name: i.name,
            description: i.description,
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

        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return sendError(res, 'Item IDs are required', 400);
        }

        await FoodItem.updateMany(
            { _id: { $in: itemIds } },
            { $set: updates }
        );

        return sendSuccess(res, null, `${itemIds.length} items updated successfully`);
    } catch (error: any) {
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
