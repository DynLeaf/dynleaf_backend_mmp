import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as adminAnalyticsService from '../services/adminAnalyticsService.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { parseDateRange } from '../utils/dateRange.js';

/**
 * GET /admin/analytics/outlets/overview
 * Returns aggregated metrics across all outlets with top summary cards
 */
export const getOutletAnalyticsOverview = async (req: Request, res: Response) => {
    try {
        const { range, date_from, date_to } = req.query;
        const { start, end } = parseDateRange(range as string, date_from as string, date_to as string);


        const totals = await adminAnalyticsService.getOutletAnalyticsOverview(start, end);

        return sendSuccess(res, {
            window: { range: range || '7d', start, end },
            totals,
        });
    } catch (error: any) {
        console.error('[getOutletAnalyticsOverview] Error:', error);
        return sendError(res, error.message || 'Failed to fetch outlet analytics overview');
    }
};

/**
 * GET /admin/analytics/outlets/list
 * Returns paginated list of outlets with their analytics sorted by performance
 */
export const getOutletAnalyticsList = async (req: Request, res: Response) => {
    try {
        const { range, date_from, date_to, page = '1', limit = '10' } = req.query;
        const { start, end } = parseDateRange(range as string, date_from as string, date_to as string);
        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;


        const { result, total } = await adminAnalyticsService.getOutletAnalyticsList(start, end, skip, limitNum);

        return sendSuccess(res, {
            window: { range: range || '7d', start, end },
            outlets: result,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error: any) {
        console.error('[getOutletAnalyticsList] Error:', error);
        return sendError(res, error.message || 'Failed to fetch outlet analytics list');
    }
};

/**
 * GET /admin/analytics/outlets/:id/summary
 * Returns summary metrics for a single outlet
 */
export const getOutletAnalyticsSummary = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { range, date_from, date_to } = req.query;
        const { start, end } = parseDateRange(range as string, date_from as string, date_to as string);

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendError(res, 'Invalid outlet ID', 400);
        }


        const data = await adminAnalyticsService.getOutletAnalyticsSummary(id, start, end);
        if (!data) return sendError(res, 'Outlet not found', 404);
        
        const { outlet, summary } = data;

        // Restructure source data for easier frontend consumption
        const profile_view_sources = {
            qr_scan: summary.profile_view_sources_qr_scan,
            whatsapp: summary.profile_view_sources_whatsapp,
            link: summary.profile_view_sources_link,
            telegram: summary.profile_view_sources_telegram,
            twitter: summary.profile_view_sources_twitter,
            share: summary.profile_view_sources_share,
            search: summary.profile_view_sources_search,
            home: summary.profile_view_sources_home,
            menu_page: summary.profile_view_sources_menu_page,
            direct_url: summary.profile_view_sources_direct_url,
            other: summary.profile_view_sources_other,
        };

        const menu_view_sources = {
            qr_scan: summary.menu_view_sources_qr_scan,
            whatsapp: summary.menu_view_sources_whatsapp,
            link: summary.menu_view_sources_link,
            telegram: summary.menu_view_sources_telegram,
            twitter: summary.menu_view_sources_twitter,
            share: summary.menu_view_sources_share,
            search: summary.menu_view_sources_search,
            home: summary.menu_view_sources_home,
            profile_page: summary.menu_view_sources_profile_page,
            direct_url: summary.menu_view_sources_direct_url,
            other: summary.menu_view_sources_other,
        };

        return sendSuccess(res, {
            window: { range: range || '7d', start, end },
            outlet,
            summary: {
                total_menu_views: summary.total_menu_views,
                total_menu_views_qr: summary.total_menu_views_qr,
                total_profile_views: summary.total_profile_views,
                total_profile_views_qr: summary.total_profile_views_qr,
                unique_sessions: summary.unique_sessions,
                profile_view_sources,
                menu_view_sources,
            },
        });
    } catch (error: any) {
        console.error('[getOutletAnalyticsSummary] Error:', error);
        return sendError(res, error.message || 'Failed to fetch outlet analytics summary');
    }
};

/**
 * GET /admin/analytics/outlets/:id/food-items
 * Returns paginated list of food items for an outlet with analytics
 */
export const getOutletFoodItemsAnalytics = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { range, date_from, date_to, page = '1', limit = '10' } = req.query;
        const { start, end } = parseDateRange(range as string, date_from as string, date_to as string);
        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendError(res, 'Invalid outlet ID', 400);
        }


        const { result, total } = await adminAnalyticsService.getOutletFoodItemsAnalytics(id, start, end, skip, limitNum);

        return sendSuccess(res, {
            window: { range: range || '7d', start, end },
            food_items: result,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error: any) {
        console.error('[getOutletFoodItemsAnalytics] Error:', error);
        return sendError(res, error.message || 'Failed to fetch food items analytics');
    }
};
