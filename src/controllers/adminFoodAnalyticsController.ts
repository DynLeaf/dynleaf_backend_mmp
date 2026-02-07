import { Request, Response } from 'express';
import { FoodItemAnalyticsSummary } from '../models/FoodItemAnalyticsSummary.js';
import { FoodItem } from '../models/FoodItem.js';
import { Outlet } from '../models/Outlet.js';

/**
 * Parse date range and return start/end dates (EXCLUDES today)
 */
function parseDateRange(rangeQuery?: string, customStart?: string, customEnd?: string) {
    const now = new Date();
    const end = new Date();
    end.setHours(0, 0, 0, 0); // Today at midnight (excludes today)

    let start = new Date(end);

    if (rangeQuery === 'custom' && customStart && customEnd) {
        start = new Date(customStart);
        const customEndDate = new Date(customEnd);
        return { start, end: new Date(Math.min(customEndDate.getTime(), end.getTime())) };
    }

    switch (rangeQuery) {
        case 'yesterday':
            start.setDate(start.getDate() - 1);
            break;
        case '7d':
            start.setDate(start.getDate() - 7);
            break;
        case '30d':
            start.setDate(start.getDate() - 30);
            break;
        default:
            start.setDate(start.getDate() - 7); // Default to 7 days
    }

    return { start, end };
}

/**
 * GET /admin/analytics/food/overview
 * Top food item overview for main analytics page
 */
export async function getFoodOverview(req: Request, res: Response) {
    try {
        const { range, custom_start, custom_end } = req.query;
        const { start, end } = parseDateRange(range as string, custom_start as string, custom_end as string);

        // Get top viewed food item
        const topViewed = await FoodItemAnalyticsSummary.aggregate([
            {
                $match: {
                    date: { $gte: start, $lt: end },
                },
            },
            {
                $group: {
                    _id: '$food_item_id',
                    totalViews: { $sum: '$metrics.views' },
                    outlet_id: { $first: '$outlet_id' },
                },
            },
            { $sort: { totalViews: -1 } },
            { $limit: 1 },
        ]);

        if (topViewed.length === 0) {
            return res.json({
                top_viewed_item: null,
            });
        }

        const topItem = topViewed[0];
        const foodItem = await FoodItem.findById(topItem._id).select('name image_url').lean();
        const outlet = await Outlet.findById(topItem.outlet_id).select('name').lean();

        res.json({
            top_viewed_item: {
                food_item_id: topItem._id,
                name: foodItem?.name || 'Unknown',
                image_url: foodItem?.image_url,
                outlet_name: outlet?.name || 'Unknown',
                total_views: topItem.totalViews,
            },
        });
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

        // Get total food views
        const totalViewsAgg = await FoodItemAnalyticsSummary.aggregate([
            {
                $match: {
                    date: { $gte: start, $lt: end },
                },
            },
            {
                $group: {
                    _id: null,
                    totalViews: { $sum: '$metrics.views' },
                },
            },
        ]);

        const totalViews = totalViewsAgg[0]?.totalViews || 0;

        // Get top viewed item
        const topViewedAgg = await FoodItemAnalyticsSummary.aggregate([
            {
                $match: {
                    date: { $gte: start, $lt: end },
                },
            },
            {
                $group: {
                    _id: '$food_item_id',
                    totalViews: { $sum: '$metrics.views' },
                    outlet_id: { $first: '$outlet_id' },
                },
            },
            { $sort: { totalViews: -1 } },
            { $limit: 1 },
        ]);

        let top_viewed_item = null;
        if (topViewedAgg.length > 0) {
            const item = topViewedAgg[0];
            const foodItem = await FoodItem.findById(item._id).select('name image_url').lean();
            const outlet = await Outlet.findById(item.outlet_id).select('name').lean();

            top_viewed_item = {
                name: foodItem?.name || 'Unknown',
                image_url: foodItem?.image_url,
                view_count: item.totalViews,
                outlet_name: outlet?.name || 'Unknown',
            };
        }

        // Get most voted item (from current vote_count in summaries)
        const mostVotedAgg = await FoodItemAnalyticsSummary.aggregate([
            {
                $match: {
                    date: { $gte: start, $lt: end },
                },
            },
            {
                $group: {
                    _id: '$food_item_id',
                    totalViews: { $sum: '$metrics.views' },
                    voteCount: { $max: '$vote_count' }, // Take max vote_count from period
                    outlet_id: { $first: '$outlet_id' },
                },
            },
            { $sort: { voteCount: -1 } },
            { $limit: 1 },
        ]);

        let most_voted_item = null;
        if (mostVotedAgg.length > 0) {
            const item = mostVotedAgg[0];
            const foodItem = await FoodItem.findById(item._id).select('name image_url').lean();
            const outlet = await Outlet.findById(item.outlet_id).select('name').lean();

            most_voted_item = {
                name: foodItem?.name || 'Unknown',
                image_url: foodItem?.image_url,
                vote_count: item.voteCount || 0,
                view_count: item.totalViews,
                outlet_name: outlet?.name || 'Unknown',
            };
        }

        res.json({
            total_food_views: totalViews,
            top_viewed_item,
            most_voted_item,
        });
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

        // Get top viewed items
        const items = await FoodItemAnalyticsSummary.aggregate([
            {
                $match: {
                    date: { $gte: start, $lt: end },
                },
            },
            {
                $group: {
                    _id: '$food_item_id',
                    totalViews: { $sum: '$metrics.views' },
                    voteCount: { $max: '$vote_count' },
                    outlet_id: { $first: '$outlet_id' },
                },
            },
            { $sort: { totalViews: -1 } },
            {
                $facet: {
                    items: [{ $skip: skip }, { $limit: limitNum }],
                    totalCount: [{ $count: 'count' }],
                },
            },
        ]);

        const results = items[0]?.items || [];
        const totalCount = items[0]?.totalCount[0]?.count || 0;

        // Populate food item and outlet details
        const populatedResults = await Promise.all(
            results.map(async (item: any) => {
                const foodItem = await FoodItem.findById(item._id).select('name image_url').lean();
                const outlet = await Outlet.findById(item.outlet_id).select('name').lean();

                return {
                    food_item_id: item._id,
                    name: foodItem?.name || 'Unknown',
                    image_url: foodItem?.image_url,
                    outlet_name: outlet?.name || 'Unknown',
                    view_count: item.totalViews,
                    vote_count: item.voteCount || 0,
                };
            })
        );

        res.json({
            items: populatedResults,
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

        // Get most voted items
        const items = await FoodItemAnalyticsSummary.aggregate([
            {
                $match: {
                    date: { $gte: start, $lt: end },
                },
            },
            {
                $group: {
                    _id: '$food_item_id',
                    totalViews: { $sum: '$metrics.views' },
                    voteCount: { $max: '$vote_count' },
                    outlet_id: { $first: '$outlet_id' },
                },
            },
            { $sort: { voteCount: -1, totalViews: -1 } }, // Sort by votes first, then views
            {
                $facet: {
                    items: [{ $skip: skip }, { $limit: limitNum }],
                    totalCount: [{ $count: 'count' }],
                },
            },
        ]);

        const results = items[0]?.items || [];
        const totalCount = items[0]?.totalCount[0]?.count || 0;

        // Populate food item and outlet details
        const populatedResults = await Promise.all(
            results.map(async (item: any) => {
                const foodItem = await FoodItem.findById(item._id).select('name image_url').lean();
                const outlet = await Outlet.findById(item.outlet_id).select('name').lean();

                return {
                    food_item_id: item._id,
                    name: foodItem?.name || 'Unknown',
                    image_url: foodItem?.image_url,
                    outlet_name: outlet?.name || 'Unknown',
                    view_count: item.totalViews,
                    vote_count: item.voteCount || 0,
                };
            })
        );

        res.json({
            items: populatedResults,
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
