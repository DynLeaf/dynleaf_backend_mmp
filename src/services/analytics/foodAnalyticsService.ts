import * as foodAnalyticsRepo from '../../repositories/analytics/foodAnalyticsRepository.js';
import * as foodItemRepo from '../../repositories/foodItemRepository.js';
import { AnalyticsWindow } from '../../utils/analyticsRange.js';

export const getAdminFoodAnalytics = async (window: AnalyticsWindow) => {
    const [viewsAgg, topVoted, shares] = await Promise.all([
        foodAnalyticsRepo.aggregateAllFoodEvents(window.start, window.end),
        foodAnalyticsRepo.getTopVotedFoodItems(window.start, window.end),
        foodAnalyticsRepo.countShares(window.start, window.end),
    ]);

    const topViewed = viewsAgg?.[0]?.topViewed || [];
    const totalViews = viewsAgg?.[0]?.totals?.[0]?.totalViews || 0;

    const topViewedIds = topViewed.map((d: any) => d._id);
    const topVotedIds = topVoted.map((d: any) => d._id);

    const [viewedDocs, votedDocs] = await Promise.all([
        foodItemRepo.findByIds(topViewedIds),
        foodItemRepo.findByIds(topVotedIds),
    ]);

    const viewedNameById = new Map(viewedDocs.map((f: any) => [String(f._id), f.name]));
    const votedNameById = new Map(votedDocs.map((f: any) => [String(f._id), f.name]));

    return {
        window: { range: window.range, start: window.start, end: window.end },
        totalViews,
        totalShares: shares,
        topViewed: topViewed.map((d: any) => ({
            id: String(d._id),
            name: viewedNameById.get(String(d._id)) || 'Unknown',
            views: d.views || 0,
        })),
        topVoted: topVoted.map((d: any) => ({
            id: String(d._id),
            name: votedNameById.get(String(d._id)) || 'Unknown',
            votes: d.votes || 0,
        })),
    };
};
