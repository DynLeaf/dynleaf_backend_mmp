import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response.js';
import * as categoryService from '../../services/admin/adminCategoryService.js';
import { AppError } from '../../errors/AppError.js';

export const getUploadSignature = async (req: Request, res: Response) => {
    try {
        const data = await categoryService.getUploadSignature(req.body?.mimeType);
        return sendSuccess(res, data);
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, 'Failed to get upload signature', null, 500);
    }
};

export const uploadViaBackend = async (req: Request, res: Response) => {
    try {
        const { fileBuffer, fileName, mimeType } = req.body || {};
        const data = await categoryService.uploadImageViaBackend(fileBuffer, fileName, mimeType);
        return sendSuccess(res, data);
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, 'Failed to upload image', null, 500);
    }
};

export const getCategoryImages = async (req: Request, res: Response) => {
    try {
        const images = await categoryService.listCategoryImages();
        return sendSuccess(res, images);
    } catch (error: unknown) {
        return sendError(res, (error as any).message);
    }
};

export const createCategoryImage = async (req: Request, res: Response) => {
    try {
        const { name, image_url } = req.body;
        const image = await categoryService.createCategoryImage(name, image_url);
        return sendSuccess(res, image, 'Category image created', 201);
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};

export const updateCategoryImage = async (req: Request, res: Response) => {
    try {
        const { name, image_url } = req.body;
        const image = await categoryService.updateCategoryImage(req.params.id, name, image_url);
        return sendSuccess(res, image, 'Category image updated');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};

export const deleteCategoryImage = async (req: Request, res: Response) => {
    try {
        await categoryService.deleteCategoryImage(req.params.id);
        return sendSuccess(res, null, 'Category image deleted');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};

export const getCategorySlugMap = async (req: Request, res: Response) => {
    try {
        const unassigned = req.query.unassigned === 'true';
        const mappings = await categoryService.listCategorySlugMaps(unassigned);
        return sendSuccess(res, mappings);
    } catch (error: unknown) {
        return sendError(res, (error as any).message);
    }
};

export const updateCategorySlugMap = async (req: Request, res: Response) => {
    try {
        const mapping = await categoryService.assignCategorySlugMap(req.params.slug, req.body.itemKey);
        return sendSuccess(res, mapping, 'Slug mapping updated');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};

export const getCategoriesWithoutImages = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const data = await categoryService.listCategoriesWithoutImages(page, limit);
        return sendSuccess(res, data);
    } catch (error: unknown) {
        return sendError(res, (error as any).message);
    }
};
