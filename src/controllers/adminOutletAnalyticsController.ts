import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { OutletAnalyticsSummary } from '../models/OutletAnalyticsSummary.js';
import { FoodItemAnalyticsSummary } from '../models/FoodItemAnalyticsSummary.js';
import { Outlet } from '../models/Outlet.js';
import { FoodItem } from '../models/FoodItem.js';
import { sendSuccess, sendError } from '../utils/response.js';

// Helper to parse date range
const parseDateRange = (range?: string, date_from?: string, date_to?: string) => {
    const now = new Date();
    let start: Date, end: Date;

    if (range === 'yesterday') {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    } else if (range === '7d') {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    } else if (range === '30d') {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30));
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    } else if (range === 'custom' && date_from && date_to) {
        start = new Date(date_from);
        end = new Date(date_to);
    } else {
        // Default to last 7 days
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    }

    return { start, end };
};

/**
 * GET /admin/analytics/outlets/overview
 * Returns aggregated metrics across all outlets with top summary cards
 */
export const getOutletAnalyticsOverview = async (req: Request, res: Response) => {
    try {
        const { range, date_from, date_to } = req.query;
        const { start, end } = parseDateRange(range as string, date_from as string, date_to as string);

        console.log(`[getOutletAnalyticsOverview] Range: ${range || '7d'}, Start: ${start.toISOString()}, End: ${end.toISOString()}`);

        // Aggregate all summaries within the date range
        const aggregation = await OutletAnalyticsSummary.aggregate([
            {
                $match: {
                    date: { $gte: start, $lt: end },
                },
            },
            {
                $group: {
                    _id: null,
                    total_outlet_views: { $sum: { $add: ['$metrics.profile_views', '$metrics.menu_views'] } },
                    total_menu_views: { $sum: '$metrics.menu_views' },
                    total_qr_menu_views: { $sum: '$metrics.qr_menu_views' },
                    total_qr_profile_views: { $sum: '$metrics.qr_profile_views' },
                },
            },
        ]);

        const totals = aggregation[0] || {
            total_outlet_views: 0,
            total_menu_views: 0,
            total_qr_menu_views: 0,
            total_qr_profile_views: 0,
        };

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

        console.log(`[getOutletAnalyticsList] Range: ${range || '7d'}, Page: ${pageNum}, Limit: ${limitNum}`);

        // Aggregate summaries by outlet_id
        const outletAggregation = await OutletAnalyticsSummary.aggregate([
            {
                $match: {
                    date: { $gte: start, $lt: end },
                },
            },
            {
                $group: {
                    _id: '$outlet_id',
                    total_views: { $sum: { $add: ['$metrics.profile_views', '$metrics.menu_views'] } },
                    profile_views: { $sum: '$metrics.profile_views' },
                    menu_views: { $sum: '$metrics.menu_views' },
                    qr_menu_views: { $sum: '$metrics.qr_menu_views' },
                    qr_profile_views: { $sum: '$metrics.qr_profile_views' },
                    unique_sessions: { $sum: '$metrics.unique_sessions' },
                },
            },
            { $sort: { total_views: -1 } },
        ]);

        const total = outletAggregation.length;
        const paginatedData = outletAggregation.slice(skip, skip + limitNum);

        // Fetch outlet details
        const outletIds = paginatedData.map((item) => item._id);
        const outlets = await Outlet.find({ _id: { $in: outletIds } })
            .select('name slug logo_url status')
            .lean();

        const outletMap = new Map(outlets.map((o: any) => [String(o._id), o]));

        const result = paginatedData.map((item) => ({
            outlet_id: item._id,
            outlet: outletMap.get(String(item._id)),
            analytics: {
                total_views: item.total_views,
                profile_views: item.profile_views,
                menu_views: item.menu_views,
                qr_menu_views: item.qr_menu_views,
                qr_profile_views: item.qr_profile_views,
                unique_sessions: item.unique_sessions,
            },
        }));

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

        console.log(`[getOutletAnalyticsSummary] Outlet: ${id}, Range: ${range || '7d'}`);

        // Verify outlet exists
        const outlet = await Outlet.findById(id).select('name slug logo_url').lean();
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // Aggregate summaries for this outlet
        const aggregation = await OutletAnalyticsSummary.aggregate([
            {
                $match: {
                    outlet_id: new mongoose.Types.ObjectId(id),
                    date: { $gte: start, $lt: end },
                },
            },
            {
                $group: {
                    _id: null,
                    total_menu_views: { $sum: '$metrics.menu_views' },
                    total_menu_views_qr: { $sum: '$metrics.qr_menu_views' },
                    total_profile_views: { $sum: '$metrics.profile_views' },
                    total_profile_views_qr: { $sum: '$metrics.qr_profile_views' },
                    unique_sessions: { $sum: '$metrics.unique_sessions' },
                },
            },
        ]);

        const summary = aggregation[0] || {
            total_menu_views: 0,
            total_menu_views_qr: 0,
            total_profile_views: 0,
            total_profile_views_qr: 0,
            unique_sessions: 0,
        };

        return sendSuccess(res, {
            window: { range: range || '7d', start, end },
            outlet,
            summary,
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

        console.log(`[getOutletFoodItemsAnalytics] Outlet: ${id}, Range: ${range || '7d'}, Page: ${pageNum}`);

        // Aggregate food items by source (home vs menu)
        const foodItemsAggregation = await FoodItemAnalyticsSummary.aggregate([
            {
                $match: {
                    outlet_id: new mongoose.Types.ObjectId(id),
                    date: { $gte: start, $lt: end },
                },
            },
            {
                $group: {
                    _id: '$food_item_id',
                    total_views: { $sum: '$metrics.views' },
                    views_from_home: {
                        $sum: {
                            $cond: [{ $ifNull: ['$source_breakdown.home', false] }, '$source_breakdown.home', 0],
                        },
                    },
                    views_from_homepage_trending: {
                        $sum: {
                            $cond: [
                                { $ifNull: ['$source_breakdown.homepage_trending', false] },
                                '$source_breakdown.homepage_trending',
                                0,
                            ],
                        },
                    },
                    views_from_menu: {
                        $sum: {
                            $cond: [{ $ifNull: ['$source_breakdown.menu', false] }, '$source_breakdown.menu', 0],
                        },
                    },
                },
            },
            {
                $addFields: {
                    views_from_home_total: { $add: ['$views_from_home', '$views_from_homepage_trending'] },
                },
            },
            { $sort: { total_views: -1 } },
        ]);

        const total = foodItemsAggregation.length;
        const paginatedData = foodItemsAggregation.slice(skip, skip + limitNum);

        // Fetch food item details
        const foodItemIds = paginatedData.map((item) => item._id);
        const foodItems = await FoodItem.find({ _id: { $in: foodItemIds } })
            .select('name description price image_url')
            .lean();

        const foodItemMap = new Map(foodItems.map((f: any) => [String(f._id), f]));

        const result = paginatedData.map((item) => ({
            food_item_id: item._id,
            food_item: foodItemMap.get(String(item._id)),
            analytics: {
                total_views: item.total_views,
                views_from_home: item.views_from_home_total,
                views_from_menu: item.views_from_menu,
            },
        }));

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
