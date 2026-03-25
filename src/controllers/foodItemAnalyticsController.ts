import { Request, Response } from 'express';
import * as analyticsService from '../services/analytics/foodItemAnalyticsService.js';
import { sendError, sendSuccess } from '../utils/response.js';
import * as utils from '../utils/analyticsUtils.js';

const DEDUPE_MINUTES_IMPRESSION = 10;

const handleError = (res: Response, error: unknown) => {
    const err = error as { message?: string; statusCode?: number };
    return sendError(res, err.message || 'Error processing analytics', null, err.statusCode || 500);
};

export const trackFoodItemImpression = async (req: Request, res: Response) => {
    try {
        const result = await analyticsService.trackEvent({
            ...(req.body as Record<string, unknown>),
            event_type: 'item_impression',
            session_id: (req.body.session_id as string) || 'anonymous',
            device_type: utils.detectDeviceType(req.headers['user-agent'] || ''),
            ip_address: utils.getIpAddress(req) as string | undefined
        }, { dedupeMinutes: DEDUPE_MINUTES_IMPRESSION });
        return sendSuccess(res, result);
    } catch (error) {
        return handleError(res, error);
    }
};

export const trackFoodItemView = async (req: Request, res: Response) => {
    try {
        const result = await analyticsService.trackEvent({
            ...(req.body as Record<string, unknown>),
            event_type: 'item_view',
            session_id: (req.body.session_id as string) || 'anonymous',
            device_type: utils.detectDeviceType(req.headers['user-agent'] || ''),
            ip_address: utils.getIpAddress(req) as string | undefined
        });
        return sendSuccess(res, result);
    } catch (error) {
        return handleError(res, error);
    }
};

export const trackFoodItemAddToCart = async (req: Request, res: Response) => {
    try {
        const result = await analyticsService.trackEvent({
            ...(req.body as Record<string, unknown>),
            event_type: 'add_to_cart',
            session_id: (req.body.session_id as string) || 'anonymous',
            device_type: utils.detectDeviceType(req.headers['user-agent'] || ''),
            ip_address: utils.getIpAddress(req) as string | undefined
        });
        return sendSuccess(res, result);
    } catch (error) {
        return handleError(res, error);
    }
};

export const trackFoodItemOrderCreated = async (req: Request, res: Response) => {
    try {
        const result = await analyticsService.trackEvent({
            ...(req.body as Record<string, unknown>),
            event_type: 'order_created',
            session_id: (req.body.session_id as string) || 'anonymous',
            device_type: utils.detectDeviceType(req.headers['user-agent'] || ''),
            ip_address: utils.getIpAddress(req) as string | undefined
        });
        return sendSuccess(res, result);
    } catch (error) {
        return handleError(res, error);
    }
};

export const getFoodItemAnalyticsByOutlet = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { date_from, date_to, source, sortBy, limit } = req.query;
        const range = utils.parseDateRange(date_from, date_to);
        const result = await analyticsService.getAnalyticsByOutlet(outletId, {
            ...range,
            source: source as string | undefined,
            sortBy: sortBy as string | undefined,
            limit: limit ? parseInt(limit as string) : undefined
        });
        return sendSuccess(res, { outlet_id: outletId, ...result });
    } catch (error) {
        return handleError(res, error);
    }
};

export const getFoodItemAnalyticsByBrand = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { date_from, date_to, source, sortBy, limit } = req.query;
        const range = utils.parseDateRange(date_from, date_to);
        const result = await analyticsService.getAnalyticsByBrand(brandId, {
            ...range,
            source: source as string | undefined,
            sortBy: sortBy as string | undefined,
            limit: limit ? parseInt(limit as string) : undefined
        });
        return sendSuccess(res, result);
    } catch (error) {
        return handleError(res, error);
    }
};

export const getFoodItemAnalyticsByCategory = async (req: Request, res: Response) => {
    try {
        const { categoryId } = req.params;
        const { outlet_id, date_from, date_to, source, sortBy, limit } = req.query;
        const range = utils.parseDateRange(date_from, date_to);
        const result = await analyticsService.getAnalyticsByCategory(categoryId, {
            ...range,
            outletId: outlet_id as string | undefined,
            source: source as string | undefined,
            sortBy: sortBy as string | undefined,
            limit: limit ? parseInt(limit as string) : undefined
        });
        return sendSuccess(res, { category_id: categoryId, ...result });
    } catch (error) {
        return handleError(res, error);
    }
};

export const getFoodItemAnalyticsByItem = async (req: Request, res: Response) => {
    try {
        const { foodItemId } = req.params;
        const { date_from, date_to, source } = req.query;
        const range = utils.parseDateRange(date_from, date_to);
        const result = await analyticsService.getAnalyticsByItem(foodItemId, {
            ...range,
            source: source as string | undefined
        });
        return sendSuccess(res, { food_item_id: foodItemId, ...result });
    } catch (error) {
        return handleError(res, error);
    }
};
