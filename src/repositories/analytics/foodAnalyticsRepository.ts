import { FoodItemAnalyticsSummary } from '../../models/FoodItemAnalyticsSummary.js';
import { FoodItemAnalyticsEvent } from '../../models/FoodItemAnalyticsEvent.js';
import { DishVote } from '../../models/DishVote.js';

export const getTopFoodItemsByViews = async (start: Date, end: Date, limit: number = 10) => {
    return FoodItemAnalyticsSummary.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        {
            $group: {
                _id: '$food_item_id',
                views: { $sum: '$metrics.views' },
            },
        },
        { $sort: { views: -1 } },
        { $limit: limit },
    ]);
};

export const getTopVotedFoodItems = async (start: Date, end: Date, limit: number = 10) => {
    return DishVote.aggregate([
        { $match: { created_at: { $gte: start, $lte: end } } },
        {
            $group: {
                _id: '$food_item_id',
                votes: { $sum: 1 },
            },
        },
        { $sort: { votes: -1 } },
        { $limit: limit },
    ]);
};

export const countShares = async (start: Date, end: Date): Promise<number> => {
    return FoodItemAnalyticsEvent.countDocuments({
        event_type: 'share',
        timestamp: { $gte: start, $lte: end },
    });
};

export const aggregateAllFoodEvents = async (start: Date, end: Date) => {
    return FoodItemAnalyticsEvent.aggregate([
        {
            $match: {
                event_type: 'item_view',
                timestamp: { $gte: start, $lte: end },
            },
        },
        {
            $facet: {
                topViewed: [
                    { $group: { _id: '$food_item_id', views: { $sum: 1 } } },
                    { $sort: { views: -1 } },
                    { $limit: 10 },
                ],
                totals: [{ $group: { _id: null, totalViews: { $sum: 1 } } }],
            },
        },
    ]);
};
