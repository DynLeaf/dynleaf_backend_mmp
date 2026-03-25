import { Request, Response } from 'express';
import * as categoryService from '../../services/menu-management/categoryService.js';
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

export const createCategory = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const outletId = await getActiveOutletId(brandId);
        const category = await categoryService.createCategory(outletId, req.body);
        return sendSuccess(res, category, 'Category created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const listCategories = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const outletId = await getActiveOutletId(brandId);
        const categories = await categoryService.listCategories(outletId);
        return sendSuccess(res, categories);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const updateCategory = async (req: Request, res: Response) => {
    try {
        const { categoryId } = req.params;
        // Legacy updateCategory just took categoryId
        const category = await categoryService.updateCategory('', categoryId, req.body);
        return sendSuccess(res, category, 'Category updated successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const deleteCategory = async (req: Request, res: Response) => {
    try {
        const { categoryId } = req.params;
        await categoryService.deleteCategory('', categoryId);
        return sendSuccess(res, null, 'Category deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

// Outlet-centric methods (keep for backward compatibility with the new modular routes)
export const createCategoryForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const category = await categoryService.createCategory(outletId, req.body);
        return sendSuccess(res, category, 'Category created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const listCategoriesForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const categories = await categoryService.listCategories(outletId);
        return sendSuccess(res, categories);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const updateCategoryForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, categoryId } = req.params;
        const category = await categoryService.updateCategory(outletId, categoryId, req.body);
        return sendSuccess(res, category, 'Category updated successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const deleteCategoryForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, categoryId } = req.params;
        await categoryService.deleteCategory(outletId, categoryId);
        return sendSuccess(res, null, 'Category deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const bulkUpdateCategoryItemTypeForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, categoryId } = req.params;
        const { itemType } = req.body;
        const result = await categoryService.bulkUpdateCategoryItemType(outletId, categoryId, itemType);
        return sendSuccess(res, null, `${result.modifiedCount} items in category converted to ${itemType} successfully`);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};
