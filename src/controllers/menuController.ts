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
        const { name, description, isVeg, basePrice, taxPercentage, imageUrl, isActive } = req.body;

        const foodItem = await FoodItem.create({
            brand_id: brandId,
            name,
            description,
            is_veg: isVeg,
            base_price: basePrice,
            tax_percentage: taxPercentage,
            image_url: imageUrl,
            is_active: isActive
        });

        return sendSuccess(res, { id: foodItem._id, name: foodItem.name, isVeg: foodItem.is_veg, basePrice: foodItem.base_price, isActive: foodItem.is_active }, null, 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const listFoodItems = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const items = await FoodItem.find({ brand_id: brandId });
        return sendSuccess(res, items.map(i => ({ id: i._id, name: i.name, isVeg: i.is_veg, basePrice: i.base_price, isActive: i.is_active })));
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
