import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware.js';
import * as offerService from '../services/offerService.js';
import { sendSuccess, sendError } from '../utils/response.js';

export const createOffer = async (req: AuthRequest, res: Response) => {
    try {
        const offer = await offerService.createOffer(req.params.outletId, req.body, req.user, req.outlet);
        return sendSuccess(res, { message: 'Offer created successfully', offer }, null, 201);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message, null, err.statusCode ?? 500);
    }
};

export const getOutletOffers = async (req: AuthRequest, res: Response) => {
    try {
        const result = await offerService.getOutletOffers(req.params.outletId, req.query);
        return sendSuccess(res, result);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message, null, err.statusCode ?? 500);
    }
};

export const getOfferById = async (req: AuthRequest, res: Response) => {
    try {
        const offer = await offerService.getOfferById(req.params.outletId, req.params.offerId);
        return sendSuccess(res, { offer });
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message, null, err.statusCode ?? 500);
    }
};

export const getOfferByIdDirect = async (req: AuthRequest, res: Response) => {
    try {
        const offer = await offerService.getOfferByIdDirect(req.params.offerId);
        return sendSuccess(res, { offer });
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message, null, err.statusCode ?? 500);
    }
};

export const updateOffer = async (req: AuthRequest, res: Response) => {
    try {
        const offer = await offerService.updateOffer(req.params.outletId, req.params.offerId, req.body);
        return sendSuccess(res, { message: 'Offer updated successfully', offer });
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message, null, err.statusCode ?? 500);
    }
};

export const deleteOffer = async (req: AuthRequest, res: Response) => {
    try {
        await offerService.deleteOffer(req.params.outletId, req.params.offerId);
        return sendSuccess(res, { message: 'Offer deleted successfully' });
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message, null, err.statusCode ?? 500);
    }
};

export const toggleOfferStatus = async (req: AuthRequest, res: Response) => {
    try {
        const result = await offerService.toggleOfferStatus(req.params.outletId, req.params.offerId);
        return sendSuccess(res, result);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message, null, err.statusCode ?? 500);
    }
};

export const getNearbyOffers = async (req: AuthRequest, res: Response) => {
    try {
        const result = await offerService.getNearbyOffers(req.query as Record<string, unknown>);
        return sendSuccess(res, result);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message, null, err.statusCode ?? 500);
    }
};
