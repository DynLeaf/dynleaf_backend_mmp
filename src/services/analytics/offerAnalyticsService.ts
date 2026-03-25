import * as offerAnalyticsRepo from '../../repositories/analytics/offerAnalyticsRepository.js';
import * as offerRepo from '../../repositories/offerRepository.js';
import * as systemRepo from '../../repositories/analytics/systemAnalyticsRepository.js';
import { AnalyticsWindow } from '../../utils/analyticsRange.js';

export const getAdminOffersAnalytics = async (window: AnalyticsWindow) => {
    const [offersAgg, activeCount] = await Promise.all([
        offerAnalyticsRepo.getTopOffersByEngagement(window.start, window.end, 20),
        systemRepo.countActiveOffers(),
    ]);

    const offerIds = offersAgg.map((d: any) => d._id);
    const offerDocs = await offerRepo.findByIds(offerIds);
    const offerTitleById = new Map(offerDocs.map((o: any) => [String(o._id), (o as any).title as string]));

    const totalViews = offersAgg.reduce((sum: number, d: any) => sum + (d.views || 0), 0);
    const totalClicks = offersAgg.reduce((sum: number, d: any) => sum + (d.clicks || 0), 0);
    const totalCodeCopies = offersAgg.reduce((sum: number, d: any) => sum + (d.code_copies || 0), 0);
    const ctrPct = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;

    return {
        window: { range: window.range, start: window.start, end: window.end },
        totals: {
            activeOffers: activeCount,
            totalViews,
            totalClicks,
            totalCodeCopies,
            ctrPct,
        },
        topOffers: offersAgg.map((d: any) => {
            const views = d.views || 0;
            const clicks = d.clicks || 0;
            return {
                id: String(d._id),
                title: offerTitleById.get(String(d._id)) || 'Unknown',
                views,
                clicks,
                codeCopies: d.code_copies || 0,
                ctrPct: views > 0 ? (clicks / views) * 100 : 0,
            };
        }),
    };
};
