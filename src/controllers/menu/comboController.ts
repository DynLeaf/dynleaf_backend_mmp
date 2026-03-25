import { Request, Response } from 'express';
import * as comboService from '../../services/menu-management/comboService.js';
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

export const createCombo = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const outletId = await getActiveOutletId(brandId);
        const combo = await comboService.createCombo(outletId, req.body);
        return sendSuccess(res, combo, 'Combo created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const listCombos = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const outletId = await getActiveOutletId(brandId);
        const combos = await comboService.listCombos(outletId);
        return sendSuccess(res, combos);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const getComboById = async (req: Request, res: Response) => {
    try {
        const { comboId } = req.params;
        // In the legacy route, it doesn't always have outletId.
        // If it's a public route, we might not have it.
        // We'll pass empty string and let the service handle it if it can.
        const combo = await comboService.getComboById('', comboId);
        return sendSuccess(res, combo);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const updateCombo = async (req: Request, res: Response) => {
    try {
        const { comboId } = req.params;
        const combo = await comboService.updateCombo('', comboId, req.body);
        return sendSuccess(res, combo, 'Combo updated successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const deleteCombo = async (req: Request, res: Response) => {
    try {
        const { comboId } = req.params;
        await comboService.deleteCombo('', comboId);
        return sendSuccess(res, null, 'Combo deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

// Outlet-centric methods
export const createComboForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const combo = await comboService.createCombo(outletId, req.body);
        return sendSuccess(res, combo, 'Combo created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const listCombosForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const combos = await comboService.listCombos(outletId);
        return sendSuccess(res, combos);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const updateComboForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, comboId } = req.params;
        const combo = await comboService.updateCombo(outletId, comboId, req.body);
        return sendSuccess(res, combo, 'Combo updated successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const deleteComboForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, comboId } = req.params;
        await comboService.deleteCombo(outletId, comboId);
        return sendSuccess(res, null, 'Combo deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};
