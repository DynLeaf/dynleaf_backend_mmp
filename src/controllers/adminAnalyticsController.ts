import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response.js';
import { resolveAnalyticsWindow } from '../utils/analyticsRange.js';
import { getAdminOverview, getAdminGrowthAnalytics, getAdminUsersAnalytics, getAdminEngagementAnalytics, getAdminDiscoveryAnalytics } from '../services/analytics/systemAnalyticsService.js';
import { getAdminOffersAnalytics } from '../services/analytics/offerAnalyticsService.js';
import { getAdminPromotionsAnalytics } from '../services/analytics/promotionAnalyticsService.js';
import { getAdminFoodAnalytics } from '../services/analytics/foodAnalyticsService.js';
import { getAdminOutletAnalytics } from '../services/analytics/outletAnalyticsService.js';

export const getAdminAnalyticsOverview = async (req: Request, res: Response) => {
    try {
        const window = resolveAnalyticsWindow(req.query);
        const data = await getAdminOverview(window);
        return sendSuccess(res, data, 'Analytics overview');
    } catch (error: any) {
        console.error('Admin analytics overview error:', error);
        return sendError(res, error.message || 'Failed to load analytics overview');
    }
};

export const getAdminGrowthAnalyticsHandler = async (req: Request, res: Response) => {
    try {
        const window = resolveAnalyticsWindow(req.query);
        const data = await getAdminGrowthAnalytics(window);
        return sendSuccess(res, data, 'Growth analytics');
    } catch (error: any) {
        console.error('Admin growth analytics error:', error);
        return sendError(res, error.message || 'Failed to load growth analytics');
    }
};

export const getAdminUsersAnalyticsHandler = async (req: Request, res: Response) => {
    try {
        const window = resolveAnalyticsWindow(req.query);
        const data = await getAdminUsersAnalytics(window);
        return sendSuccess(res, data, 'Users analytics');
    } catch (error: any) {
        console.error('Admin users analytics error:', error);
        return sendError(res, error.message || 'Failed to load users analytics');
    }
};

export const getAdminEngagementAnalyticsHandler = async (req: Request, res: Response) => {
    try {
        const window = resolveAnalyticsWindow(req.query);
        const data = await getAdminEngagementAnalytics(window);
        return sendSuccess(res, data, 'Engagement analytics');
    } catch (error: any) {
        console.error('Admin engagement analytics error:', error);
        return sendError(res, error.message || 'Failed to load engagement analytics');
    }
};

export const getAdminDiscoveryAnalyticsHandler = async (req: Request, res: Response) => {
    try {
        const window = resolveAnalyticsWindow(req.query);
        const data = await getAdminDiscoveryAnalytics(window);
        return sendSuccess(res, data, 'Discovery analytics');
    } catch (error: any) {
        console.error('Admin discovery analytics error:', error);
        return sendError(res, error.message || 'Failed to load discovery analytics');
    }
};

export const getAdminOffersAnalyticsHandler = async (req: Request, res: Response) => {
    try {
        const window = resolveAnalyticsWindow(req.query);
        const data = await getAdminOffersAnalytics(window);
        return sendSuccess(res, data, 'Offers analytics');
    } catch (error: any) {
        console.error('Admin offers analytics error:', error);
        return sendError(res, error.message || 'Failed to load offers analytics');
    }
};

export const getAdminPromotionsAnalyticsHandler = async (req: Request, res: Response) => {
    try {
        const window = resolveAnalyticsWindow(req.query);
        const data = await getAdminPromotionsAnalytics(window);
        return sendSuccess(res, data, 'Promotions analytics');
    } catch (error: any) {
        console.error('Admin promotions analytics error:', error);
        return sendError(res, error.message || 'Failed to load promotions analytics');
    }
};

export const getAdminFoodAnalyticsHandler = async (req: Request, res: Response) => {
    try {
        const window = resolveAnalyticsWindow(req.query);
        const data = await getAdminFoodAnalytics(window);
        return sendSuccess(res, data, 'Food analytics');
    } catch (error: any) {
        console.error('Admin food analytics error:', error);
        return sendError(res, error.message || 'Failed to load food analytics');
    }
};

export const getAdminOutletAnalyticsHandler = async (req: Request, res: Response) => {
    try {
        const window = resolveAnalyticsWindow(req.query);
        const data = await getAdminOutletAnalytics(window);
        return sendSuccess(res, data, 'Outlet analytics');
    } catch (error: any) {
        console.error('Admin outlet analytics error:', error);
        return sendError(res, error.message || 'Failed to load outlet analytics');
    }
};

export const getAdminSystemAnalytics = async (req: Request, res: Response) => {
    try {
        const window = resolveAnalyticsWindow(req.query);
        const data = await getAdminOverview(window); // mapped system analytics to overview
        return sendSuccess(res, data, 'System analytics');
    } catch (error: any) {
        console.error('Admin system analytics error:', error);
        return sendError(res, error.message || 'Failed to load system analytics');
    }
};
