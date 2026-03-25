import { Request, Response } from 'express';
import * as subMenuService from '../services/menu-management/outletSubMenuService.js';
import { sendSuccess, sendError } from '../utils/response.js';

export const listSubMenus = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const userId = (req as any).user?.id;
        const result = await subMenuService.listSubMenus(outletId, userId);
        return sendSuccess(res, result);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const createSubMenu = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const userId = (req as any).user?.id;
        const subMenu = await subMenuService.createSubMenu(outletId, userId, req.body);
        return sendSuccess(res, subMenu, 'Sub-menu created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const updateSubMenu = async (req: Request, res: Response) => {
    try {
        const { outletId, subMenuId } = req.params;
        const subMenu = await subMenuService.updateSubMenu(outletId, subMenuId, req.body);
        return sendSuccess(res, subMenu, 'Sub-menu updated successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const deleteSubMenu = async (req: Request, res: Response) => {
    try {
        const { outletId, subMenuId } = req.params;
        await subMenuService.deleteSubMenu(outletId, subMenuId);
        return sendSuccess(res, null, 'Sub-menu deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const updateSubMenuCategories = async (req: Request, res: Response) => {
    try {
        const { outletId, subMenuId } = req.params;
        const result = await subMenuService.updateSubMenuCategories(outletId, subMenuId, req.body);
        return sendSuccess(res, result, 'Sub-menu categories updated successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const reorderSubMenus = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { order } = req.body;
        await subMenuService.reorderSubMenus(outletId, order);
        return sendSuccess(res, null, 'Sub-menu order updated successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const updateMultiMenuSettings = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const settings = await subMenuService.updateMultiMenuSettings(outletId, req.body);
        return sendSuccess(res, settings, 'Multi-menu settings updated successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export { getPublicSubMenus } from '../services/menu-management/outletSubMenuService.js';
