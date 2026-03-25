import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response.js';
import * as dashboardService from '../../services/admin/adminDashboardService.js';

export const getMe = async (req: Request, res: Response) => {
    try {
        return sendSuccess(res, { user: (req as any).user });
    } catch (error: unknown) {
        return sendError(res, (error as any).message);
    }
};

export const getDashboardStats = async (req: Request, res: Response) => {
    try {
        const stats = await dashboardService.getDashboardStats();
        return sendSuccess(res, stats);
    } catch (error: unknown) {
        return sendError(res, (error as any).message);
    }
};
