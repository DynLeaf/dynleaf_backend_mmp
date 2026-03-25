import * as promoAnalyticsRepo from '../../repositories/analytics/promotionAnalyticsRepository.js';
import * as promoRepo from '../../repositories/promotionRepository.js';
import * as systemRepo from '../../repositories/analytics/systemAnalyticsRepository.js';
import { AnalyticsWindow } from '../../utils/analyticsRange.js';

export const getAdminPromotionsAnalytics = async (window: AnalyticsWindow) => {
    const [{ summariesAgg, liveEventsAgg }, activeCount] = await Promise.all([
        promoAnalyticsRepo.getTopPromotionsAndLiveEvents(window.start, window.end),
        systemRepo.countActivePromotions()
    ]);

    const mergedPromoMap = new Map<string, any>();

    const processAgg = (agg: any[]) => {
        for (const d of agg) {
            const id = String(d._id);
            const existing = mergedPromoMap.get(id) || { impressions: 0, clicks: 0, menu_views: 0 };
            mergedPromoMap.set(id, {
                impressions: existing.impressions + (d.impressions || 0),
                clicks: existing.clicks + (d.clicks || 0),
                menu_views: existing.menu_views + (d.menu_views || 0),
            });
        }
    };

    processAgg(summariesAgg);
    processAgg(liveEventsAgg);

    const topPromosAgg = Array.from(mergedPromoMap.entries()).map(([id, metrics]) => ({
        _id: id,
        ...metrics,
        score: metrics.impressions + (metrics.clicks * 3),
        ctrPct: metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0,
    })).sort((a, b) => b.score - a.score).slice(0, 10);

    const aggregatedTotals = Array.from(mergedPromoMap.values()).reduce((acc, curr) => ({
        totalImpressions: acc.totalImpressions + curr.impressions,
        totalClicks: acc.totalClicks + curr.clicks,
        totalMenuViews: acc.totalMenuViews + curr.menu_views,
    }), { totalImpressions: 0, totalClicks: 0, totalMenuViews: 0 });

    const promoIds = topPromosAgg.map((d: any) => d._id);
    const promoDocs = await promoRepo.findByIds(promoIds);
    const promoTitleById = new Map(promoDocs.map((p: any) => [String(p._id), (p as any).display_data?.banner_text || (p as any).display_data?.link_url || 'Promotion']));
    
    const ctrPct = aggregatedTotals.totalImpressions > 0 ? (aggregatedTotals.totalClicks / aggregatedTotals.totalImpressions) * 100 : 0;

    return {
        window: { range: window.range, start: window.start, end: window.end },
        totals: {
            activePromotions: activeCount,
            totalImpressions: aggregatedTotals.totalImpressions || 0,
            totalClicks: aggregatedTotals.totalClicks || 0,
            totalMenuViews: aggregatedTotals.totalMenuViews || 0,
            ctrPct,
        },
        topPromotions: topPromosAgg.map((d: any) => ({
            id: String(d._id),
            title: promoTitleById.get(String(d._id)) || 'Unknown',
            impressions: d.impressions || 0,
            clicks: d.clicks || 0,
            menuViews: d.menu_views || 0,
            ctrPct: d.ctrPct || 0,
        })),
    };
};
