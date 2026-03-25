import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response.js';
import * as outletService from '../../services/admin/adminOutletService.js';
import { AppError } from '../../errors/AppError.js';

export const getOutlets = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const data = await outletService.listOutlets(page, limit, req.query);
        return sendSuccess(res, data);
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};

export const getOutletDetail = async (req: Request, res: Response) => {
    try {
        const data = await outletService.getOutletDetail(req.params.id);
        return sendSuccess(res, data);
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};

export const updateOutletStatus = async (req: Request, res: Response) => {
    try {
        const data = await outletService.updateOutletStatus(req.params.id, req.body.status);
        return sendSuccess(res, data, 'Outlet status updated successfully');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};

export const changeOutletOwner = async (req: Request, res: Response) => {
    try {
        const data = await outletService.changeOutletOwner(req.params.id, req.body.user_id, (req as any).user?.userId);
        return sendSuccess(res, data, 'Outlet owner updated successfully');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};

export const toggleComplianceVerification = async (req: Request, res: Response) => {
    try {
        const data = await outletService.toggleComplianceVerification(req.params.id, (req as any).user?.userId);
        return sendSuccess(res, data, `Compliance is now ${data?.is_verified ? 'verified' : 'not verified'}`);
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};

export const updateCompliance = async (req: Request, res: Response) => {
    try {
        const data = await outletService.updateCompliance(req.params.id, req.body);
        return sendSuccess(res, data, 'Compliance information updated successfully');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};
