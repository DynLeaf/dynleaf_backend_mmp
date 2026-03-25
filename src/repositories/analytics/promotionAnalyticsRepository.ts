import { PromotionAnalyticsSummary } from '../../models/PromotionAnalyticsSummary.js';
import { PromotionEvent } from '../../models/PromotionEvent.js';

export const getTopPromotionsAndLiveEvents = async (start: Date, end: Date) => {
    const todayUtc = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    
    const [summariesAgg, liveEventsAgg] = await Promise.all([
        PromotionAnalyticsSummary.aggregate([
            { $match: { date: { $gte: start, $lte: end } } },
            {
                $group: {
                    _id: '$promotion_id',
                    impressions: { $sum: '$metrics.impressions' },
                    clicks: { $sum: '$metrics.clicks' },
                    menu_views: { $sum: '$metrics.menu_views' },
                },
            },
        ]),
        (async () => {
            if (end < todayUtc) return [];
            return PromotionEvent.aggregate([
                { $match: { timestamp: { $gte: todayUtc, $lte: end } } },
                {
                    $group: {
                        _id: '$promotion_id',
                        impressions: { $sum: { $cond: [{ $eq: ['$event_type', 'impression'] }, 1, 0] } },
                        clicks: { $sum: { $cond: [{ $eq: ['$event_type', 'click'] }, 1, 0] } },
                        menu_views: { $sum: { $cond: [{ $eq: ['$event_type', 'menu_view'] }, 1, 0] } },
                    },
                },
            ]);
        })(),
    ]);

    return { summariesAgg, liveEventsAgg };
};

export const getTopPromotionsByScore = async (start: Date, end: Date, limit: number = 10) => {
    return PromotionAnalyticsSummary.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        {
            $group: {
                _id: '$promotion_id',
                impressions: { $sum: '$metrics.impressions' },
                clicks: { $sum: '$metrics.clicks' },
                menu_views: { $sum: '$metrics.menu_views' },
            },
        },
        {
            $addFields: {
                score: { $add: ['$impressions', { $multiply: ['$clicks', 3] }] },
            },
        },
        { $sort: { score: -1 } },
        { $limit: limit },
    ]);
};

export const createEvent = async (data: any) => {
    return await PromotionEvent.create(data);
};

export const aggregateEvents = async (pipeline: any[]) => {
    return await PromotionEvent.aggregate(pipeline);
};

export const insertMany = async (events: any[]) => {
    return await PromotionEvent.insertMany(events, { ordered: false });
};
