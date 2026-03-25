import { Request, Response } from 'express';
import * as menuSyncService from '../../services/menu-management/menuSyncService.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export const importMenuForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const result = await menuSyncService.importMenu(outletId, req.body.items || req.body, req.body.options || {});
        return sendSuccess(res, result, 'Menu imported successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const exportMenuForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const result = await menuSyncService.exportMenu(outletId);
        return sendSuccess(res, result);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const previewMenuSyncForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { targetOutletIds, options } = req.body;
        const result = await menuSyncService.previewMenuSync(outletId, targetOutletIds, options);
        return sendSuccess(res, result);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const syncMenuToOutlets = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { targetOutletIds, options } = req.body;
        const result = await menuSyncService.syncMenuToOutlets(outletId, targetOutletIds, options);
        return sendSuccess(res, result, 'Menu sync completed');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const getMenuSyncStatusForOutlet = async (req: Request, res: Response) => {
    // Basic placeholder if no actual status tracking yet
    return sendSuccess(res, { status: 'idle' });
};

export const getMenuSyncHistoryForOutlet = async (req: Request, res: Response) => {
    return sendSuccess(res, []);
};
