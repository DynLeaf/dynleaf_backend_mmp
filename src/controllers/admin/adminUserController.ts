import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response.js';
import * as userService from '../../services/admin/adminUserService.js';
import { AppError } from '../../errors/AppError.js';

export const getUsers = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const search = req.query.search as string;

        const data = await userService.listUsers(page, limit, search);
        return sendSuccess(res, data);
    } catch (error: unknown) {
        return sendError(res, (error as any).message);
    }
};

export const getUserDetail = async (req: Request, res: Response) => {
    try {
        const data = await userService.getUserDetail(req.params.id);
        return sendSuccess(res, data);
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};

export const blockUser = async (req: Request, res: Response) => {
    try {
        if ((req as any).user?.role !== 'super_admin') return sendError(res, 'Only Super Admin can block users', null, 403);
        const data = await userService.blockUser(req.params.id, (req as any).user?.userId);
        return sendSuccess(res, data, 'User blocked successfully');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};

export const unblockUser = async (req: Request, res: Response) => {
    try {
        if ((req as any).user?.role !== 'super_admin') return sendError(res, 'Only Super Admin can unblock users', null, 403);
        const data = await userService.unblockUser(req.params.id);
        return sendSuccess(res, data, 'User unblocked successfully');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};

// Staff Endpoints
export const getSalesTracking = async (req: Request, res: Response) => {
    try {
        const data = await userService.getSalesTracking();
        return sendSuccess(res, data);
    } catch (error: unknown) {
        return sendError(res, (error as any).message);
    }
};

export const getCrafterTracking = async (req: Request, res: Response) => {
    try {
        const data = await userService.getCrafterTracking();
        return sendSuccess(res, data);
    } catch (error: unknown) {
        return sendError(res, (error as any).message);
    }
};

export const getStaffUsers = async (req: Request, res: Response) => {
    try {
        const data = await userService.listStaffUsers(req.query.role as string, req.query.status as string);
        return sendSuccess(res, data);
    } catch (error: unknown) {
        return sendError(res, (error as any).message);
    }
};

export const createStaffUser = async (req: Request, res: Response) => {
    try {
        const data = await userService.createStaffUser(req.body);
        return sendSuccess(res, data, 'Staff user created');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};

export const blockStaffUser = async (req: Request, res: Response) => {
    try {
        const data = await userService.blockStaffUser(req.params.id);
        return sendSuccess(res, data, 'Staff user blocked successfully');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};

export const unblockStaffUser = async (req: Request, res: Response) => {
    try {
        const data = await userService.unblockStaffUser(req.params.id);
        return sendSuccess(res, data, 'Staff user unblocked successfully');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};
