import { Request, Response } from 'express';
import * as addOnService from '../../services/menu-management/addOnService.js';
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

export const createAddOn = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const outletId = await getActiveOutletId(brandId);
        const addOn = await addOnService.createAddOn(outletId, req.body);
        return sendSuccess(res, addOn, 'Add-on created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const listAddOns = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const outletId = await getActiveOutletId(brandId);
        const addOns = await addOnService.listAddOns(outletId);
        return sendSuccess(res, addOns);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const updateAddOn = async (req: Request, res: Response) => {
    try {
        const { addOnId } = req.params;
        const addOn = await addOnService.updateAddOn('', addOnId, req.body);
        return sendSuccess(res, addOn, 'Add-on updated successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const deleteAddOn = async (req: Request, res: Response) => {
    try {
        const { addOnId } = req.params;
        await addOnService.deleteAddOn('', addOnId);
        return sendSuccess(res, null, 'Add-on deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

// Outlet-centric methods
export const createAddOnForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const addOn = await addOnService.createAddOn(outletId, req.body);
        return sendSuccess(res, addOn, 'Add-on created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const listAddOnsForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const addOns = await addOnService.listAddOns(outletId);
        return sendSuccess(res, addOns);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const updateAddOnForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, addOnId } = req.params;
        const addOn = await addOnService.updateAddOn(outletId, addOnId, req.body);
        return sendSuccess(res, addOn, 'Add-on updated successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const deleteAddOnForOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId, addOnId } = req.params;
        await addOnService.deleteAddOn(outletId, addOnId);
        return sendSuccess(res, null, 'Add-on deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};
