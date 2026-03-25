import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response.js';
import * as brandService from '../../services/admin/adminBrandService.js';
import { AppError } from '../../errors/AppError.js';

export const getBrands = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const data = await brandService.listBrands(page, limit, req.query);
        return sendSuccess(res, data);
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        console.error('Get brands error:', error);
        return sendError(res, 'Failed to fetch brands');
    }
};

export const getBrandDetail = async (req: Request, res: Response) => {
    try {
        const data = await brandService.getBrandDetail(req.params.id);
        return sendSuccess(res, data);
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        console.error('Get brand details error:', error);
        return sendError(res, 'Failed to fetch brand details');
    }
};

export const changeBrandOwner = async (req: Request, res: Response) => {
    try {
        const reviewerId = (req as any).user?.userId;
        const data = await brandService.changeBrandOwner(req.params.id, req.body.user_id, reviewerId);
        return sendSuccess(res, data, 'Brand owner updated successfully');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        console.error('Change brand owner error:', error);
        return sendError(res, 'Failed to change brand owner');
    }
};

export const approveBrand = async (req: Request, res: Response) => {
    try {
        const data = await brandService.approveBrand(req.params.id);
        return sendSuccess(res, data, 'Brand approved successfully');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        console.error('Approve brand error:', error);
        return sendError(res, 'Failed to approve brand');
    }
};

export const rejectBrand = async (req: Request, res: Response) => {
    try {
        const data = await brandService.rejectBrand(req.params.id, req.body.reason);
        return sendSuccess(res, data, 'Brand rejected successfully');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        console.error('Reject brand error:', error);
        return sendError(res, 'Failed to reject brand');
    }
};

export const getBrandUpdates = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const data = await brandService.listBrandUpdates(page, limit, req.query.status as string);
        return sendSuccess(res, data);
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        console.error('Get brand updates error:', error);
        return sendError(res, 'Failed to fetch brand updates');
    }
};

export const getBrandUpdateDetail = async (req: Request, res: Response) => {
    try {
        const data = await brandService.getBrandUpdateDetail(req.params.id);
        return sendSuccess(res, data);
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        console.error('Get brand update detail error:', error);
        return sendError(res, 'Failed to fetch brand update detail');
    }
};

export const approveBrandUpdate = async (req: Request, res: Response) => {
    try {
        const data = await brandService.approveBrandUpdate(req.params.id);
        return sendSuccess(res, data, 'Brand update approved successfully');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        console.error('Approve brand update error:', error);
        return sendError(res, 'Failed to approve brand update');
    }
};

export const rejectBrandUpdate = async (req: Request, res: Response) => {
    try {
        const data = await brandService.rejectBrandUpdate(req.params.id, req.body.reason);
        return sendSuccess(res, data, 'Brand update rejected successfully');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        console.error('Reject brand update error:', error);
        return sendError(res, 'Failed to reject brand update');
    }
};
