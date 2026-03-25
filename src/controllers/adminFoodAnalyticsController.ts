import { Request, Response } from 'express';
import * as adminAnalyticsService from '../services/adminAnalyticsService.js';
import { parseDateRange } from '../utils/dateRange.js';

/**
 * GET /admin/analytics/food/overview
 * Top food item overview for main analytics page
 */
export async function getFoodOverview(req: Request, res: Response) {
    try {
        const { range, custom_start, custom_end } = req.query;
        const { start, end } = parseDateRange(range as string, custom_start as string, custom_end as string);

        const topViewedItem = await adminAnalyticsService.getFoodOverview(start, end);
        res.json({ top_viewed_item: topViewedItem });
    } catch (error) {
        console.error('[getFoodOverview] Error:', error);
        res.status(500).json({ error: 'Failed to fetch food overview' });
    }
}

/**
 * GET /admin/analytics/food/summary
 * Top summary cards for food analytics page
 */
export async function getFoodSummary(req: Request, res: Response) {
    try {
        const { range, custom_start, custom_end } = req.query;
        const { start, end } = parseDateRange(range as string, custom_start as string, custom_end as string);

        const stats = await adminAnalyticsService.getFoodSummaryStats(start, end);
        res.json(stats);
    } catch (error) {
        console.error('[getFoodSummary] Error:', error);
        res.status(500).json({ error: 'Failed to fetch food summary' });
    }
}

/**
 * GET /admin/analytics/food/top-viewed
 * Paginated list of top viewed food items
 */
export async function getTopViewedFood(req: Request, res: Response) {
    try {
        const { range, custom_start, custom_end, page = '1', limit = '10' } = req.query;
        const { start, end } = parseDateRange(range as string, custom_start as string, custom_end as string);

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;

        const { items, totalCount } = await adminAnalyticsService.getTopViewedFood(start, end, skip, limitNum);

        res.json({
            items,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                total_pages: Math.ceil(totalCount / limitNum),
            },
        });
    } catch (error) {
        console.error('[getTopViewedFood] Error:', error);
        res.status(500).json({ error: 'Failed to fetch top viewed food items' });
    }
}

/**
 * GET /admin/analytics/food/most-voted
 * Paginated list of most voted food items
 */
export async function getMostVotedFood(req: Request, res: Response) {
    try {
        const { range, custom_start, custom_end, page = '1', limit = '10' } = req.query;
        const { start, end } = parseDateRange(range as string, custom_start as string, custom_end as string);

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;

        const { items, totalCount } = await adminAnalyticsService.getMostVotedFood(start, end, skip, limitNum);

        res.json({
            items,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                total_pages: Math.ceil(totalCount / limitNum),
            },
        });
    } catch (error) {
        console.error('[getMostVotedFood] Error:', error);
        res.status(500).json({ error: 'Failed to fetch most voted food items' });
    }
}
