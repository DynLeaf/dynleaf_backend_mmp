import { Request, Response } from 'express';
import * as foodItemService from '../../services/menu-management/foodItemService.js';
import * as outletRepo from '../../repositories/outletRepository.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AppError } from '../../errors/AppError.js';

const getActiveOutletId = async (brandId: string) => {
    const outlet = await outletRepo.findFirstActiveApprovedOutletForBrand(brandId);
    if (!outlet) {
        throw new AppError('No active outlet found for this brand', 404);
    }
    return String((outlet as any)._id);
};

export const createFoodItem = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const outletId = await getActiveOutletId(brandId);
        const foodItem = await foodItemService.createFoodItem(outletId, req.body);
        return sendSuccess(res, foodItem, 'Food item created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const listFoodItems = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const outletId = await getActiveOutletId(brandId);
        const result = await foodItemService.listFoodItems(outletId, req.query);
        return sendSuccess(res, result);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const updateFoodItem = async (req: Request, res: Response) => {
    try {
        const { foodItemId } = req.params;
        const foodItem = await foodItemService.updateFoodItem('', foodItemId, req.body);
        return sendSuccess(res, foodItem, 'Food item updated successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const deleteFoodItem = async (req: Request, res: Response) => {
    try {
        const { foodItemId } = req.params;
        await foodItemService.deleteFoodItem('', foodItemId);
        return sendSuccess(res, null, 'Food item deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const getFoodItemById = async (req: Request, res: Response) => {
    try {
        const { foodItemId } = req.params;
        const result = await foodItemService.getFoodItemById(foodItemId);
        return sendSuccess(res, result);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const duplicateFoodItem = async (req: Request, res: Response) => {
    try {
        const { foodItemId } = req.params;
        const foodItem = await foodItemService.duplicateFoodItem('', foodItemId);
        return sendSuccess(res, foodItem, 'Food item duplicated successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const bulkUpdateFoodItems = async (req: Request, res: Response) => {
    try {
        const { itemIds, updates } = req.body;
        const result = await foodItemService.bulkUpdateFoodItems('', itemIds, updates);
        return sendSuccess(res, null, `${result.modifiedCount} items updated successfully`);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const bulkDeleteFoodItems = async (req: Request, res: Response) => {
    try {
        const { itemIds } = req.body;
        await foodItemService.bulkDeleteFoodItems('', itemIds);
        return sendSuccess(res, null, 'Items deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const uploadFoodItemImage = async (req: Request, res: Response) => {
    try {
        const { foodItemId } = req.params;
        const { image, imageUrl, url } = req.body;
        const input = imageUrl || url || image;
        const result = await foodItemService.uploadFoodItemImage('', foodItemId, input);
        return sendSuccess(res, { imageUrl: result?.image_url }, 'Image uploaded successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

// Outlet-centric methods
export const createFoodItemForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const foodItem = await foodItemService.createFoodItem(outletId, req.body);
        return sendSuccess(res, foodItem, 'Food item created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const listFoodItemsForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const result = await foodItemService.listFoodItems(outletId, req.query);
        return sendSuccess(res, result);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const updateFoodItemForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, foodItemId } = req.params;
        const foodItem = await foodItemService.updateFoodItem(outletId, foodItemId, req.body);
        return sendSuccess(res, foodItem, 'Food item updated successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const deleteFoodItemForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, foodItemId } = req.params;
        await foodItemService.deleteFoodItem(outletId, foodItemId);
        return sendSuccess(res, null, 'Food item deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const duplicateFoodItemForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, foodItemId } = req.params;
        const foodItem = await foodItemService.duplicateFoodItem(outletId, foodItemId);
        return sendSuccess(res, foodItem, 'Food item duplicated successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const bulkUpdateFoodItemsForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { itemIds, updates } = req.body;
        const result = await foodItemService.bulkUpdateFoodItems(outletId, itemIds, updates);
        return sendSuccess(res, null, `${result.modifiedCount} items updated successfully`);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const bulkDeleteFoodItemsForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { itemIds } = req.body;
        await foodItemService.bulkDeleteFoodItems(outletId, itemIds);
        return sendSuccess(res, null, 'Items deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const uploadFoodItemImageForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, foodItemId } = req.params;
        const { image, imageUrl, url } = req.body;
        const input = imageUrl || url || image;
        const result = await foodItemService.uploadFoodItemImage(outletId, foodItemId, input);
        return sendSuccess(res, { imageUrl: result?.image_url }, 'Image uploaded successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const createVariant = async (req: Request, res: Response) => {
    try {
        const { foodItemId } = req.params;
        const variant = await foodItemService.createVariant(foodItemId, req.body);
        return sendSuccess(res, { id: variant._id, name: variant.name, priceDelta: variant.price_delta, isActive: variant.is_active }, null, 201);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const updateVariant = async (req: Request, res: Response) => {
    try {
        const { variantId } = req.params;
        const variant = await foodItemService.updateVariant(variantId, req.body);
        return sendSuccess(res, { id: variant._id, name: variant.name, priceDelta: variant.price_delta, isActive: variant.is_active });
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};
