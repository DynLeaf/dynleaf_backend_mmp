import mongoose from 'mongoose';
import * as outletAnalyticsEventRepo from '../../../repositories/analytics/outletAnalyticsEventRepository.js';
import * as foodItemAnalyticsRepo from '../../../repositories/analytics/foodItemAnalyticsRepository.js';
import * as offerAnalyticsRepo from '../../../repositories/analytics/offerAnalyticsRepository.js';
import * as promotionAnalyticsRepo from '../../../repositories/analytics/promotionAnalyticsRepository.js';
import * as foodItemRepo from '../../../repositories/foodItemRepository.js';
import * as offerRepo from '../../../repositories/offerRepository.js';
import * as promotionRepo from '../../../repositories/promotionRepository.js';

export class MetricComputers {
    static async computeBasicMetrics(
        outletId: mongoose.Types.ObjectId,
        period: { start: Date; end: Date }
    ) {
        const events = await outletAnalyticsEventRepo.findEvents({
            outlet_id: outletId,
            timestamp: { $gte: period.start, $lt: period.end },
        });

        const total_visits = events.filter((e) => e.event_type === 'outlet_visit').length;
        const total_menu_views = events.filter((e) => e.event_type === 'menu_view').length;
        const total_profile_views = events.filter((e) => e.event_type === 'profile_view').length;
        const unique_visitors = new Set(events.map((e) => e.session_id)).size;

        const deviceCounts = events.reduce(
            (acc, e) => {
                const device = e.device_type || 'unknown';
                acc[device] = (acc[device] || 0) + 1;
                return acc;
            },
            {} as Record<string, number>
        );

        const total = events.length || 1;
        const device_breakdown = {
            mobile: deviceCounts.mobile || 0,
            desktop: deviceCounts.desktop || 0,
            tablet: deviceCounts.tablet || 0,
            mobile_pct: parseFloat((((deviceCounts.mobile || 0) / total) * 100).toFixed(2)),
            desktop_pct: parseFloat((((deviceCounts.desktop || 0) / total) * 100).toFixed(2)),
            tablet_pct: parseFloat((((deviceCounts.tablet || 0) / total) * 100).toFixed(2)),
        };

        const foodItemEvents = await foodItemAnalyticsRepo.aggregateEvents([
            {
                $match: {
                    outlet_id: outletId,
                    event_type: 'view',
                    timestamp: { $gte: period.start, $lt: period.end },
                },
            },
            {
                $group: {
                    _id: '$food_item_id',
                    views: { $sum: 1 },
                },
            },
            { $sort: { views: -1 } },
            { $limit: 1 },
        ]);

        let top_food_item = null;
        if (foodItemEvents.length > 0) {
            const topItemId = foodItemEvents[0]._id;
            const foodItem = await foodItemRepo.findById(topItemId.toString());
            if (foodItem) {
                top_food_item = {
                    id: topItemId.toString(),
                    name: foodItem.name,
                    views: foodItemEvents[0].views,
                    image_url: foodItem.images?.[0] || undefined,
                };
            }
        }

        return {
            total_visits,
            total_menu_views,
            total_profile_views,
            unique_visitors,
            device_breakdown,
            top_food_item,
            events_processed: events.length,
        };
    }

    static async computePremiumMetrics(
        outletId: mongoose.Types.ObjectId,
        period: { start: Date; end: Date }
    ) {
        const sessions = await outletAnalyticsEventRepo.aggregateEvents([
            {
                $match: {
                    outlet_id: outletId,
                    timestamp: { $gte: period.start, $lt: period.end },
                },
            },
            { $sort: { timestamp: 1 } },
            {
                $group: {
                    _id: '$session_id',
                    first_source: { $first: '$source' },
                    first_entry_page: { $first: '$entry_page' },
                    has_visit: { $max: { $cond: [{ $eq: ['$event_type', 'outlet_visit'] }, 1, 0] } },
                    has_profile: { $max: { $cond: [{ $eq: ['$event_type', 'profile_view'] }, 1, 0] } },
                    has_menu: { $max: { $cond: [{ $eq: ['$event_type', 'menu_view'] }, 1, 0] } },
                },
            },
        ]);

        const visits = sessions.filter((s: any) => s.has_visit).length;
        const profile_sessions = sessions.filter((s: any) => s.has_profile).length;
        const menu_sessions = sessions.filter((s: any) => s.has_menu).length;

        const funnel = {
            visits,
            profile_sessions,
            menu_sessions,
            visit_to_profile_rate: visits > 0 ? parseFloat(((profile_sessions / visits) * 100).toFixed(2)) : 0,
            visit_to_menu_rate: visits > 0 ? parseFloat(((menu_sessions / visits) * 100).toFixed(2)) : 0,
            profile_to_menu_rate: profile_sessions > 0 ? parseFloat(((menu_sessions / profile_sessions) * 100).toFixed(2)) : 0,
        };

        const sessionIds = sessions.map((s: any) => s._id).filter((sid: any) => sid && sid !== 'anonymous');
        let new_sessions = 0;
        let returning_sessions = 0;

        if (sessionIds.length > 0 && sessionIds.length <= 5000) {
            const priorSessions = await outletAnalyticsEventRepo.distinctEvents('session_id', {
                outlet_id: outletId,
                session_id: { $in: sessionIds },
                timestamp: { $lt: period.start },
            });
            returning_sessions = priorSessions.length;
            new_sessions = sessionIds.length - returning_sessions;
        }

        const totalSessions = sessionIds.length || 1;
        const audience = {
            new_sessions,
            returning_sessions,
            new_pct: parseFloat(((new_sessions / totalSessions) * 100).toFixed(2)),
            returning_pct: parseFloat(((returning_sessions / totalSessions) * 100).toFixed(2)),
        };

        const sourceCounts = sessions.reduce((acc: Record<string, number>, s: any) => {
            const source = s.first_source || 'direct';
            acc[source] = (acc[source] || 0) + 1;
            return acc;
        }, {});

        const sources = Object.entries(sourceCounts)
            .map(([source, count]) => ({
                source,
                count: count as number,
                percentage: parseFloat((((count as number) / totalSessions) * 100).toFixed(2)),
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const entryPageCounts = sessions.reduce((acc: Record<string, number>, s: any) => {
            const page = s.first_entry_page || 'unknown';
            acc[page] = (acc[page] || 0) + 1;
            return acc;
        }, {});

        const entry_pages = Object.entries(entryPageCounts)
            .map(([page, count]) => ({
                page,
                count: count as number,
                percentage: parseFloat((((count as number) / totalSessions) * 100).toFixed(2)),
            }))
            .sort((a, b) => b.count - a.count);

        return {
            funnel,
            audience,
            sources,
            entry_pages,
            top_food_items: await this.computeTopFoodItems(outletId, period),
            offers: await this.computeOfferPerformance(outletId, period),
            promotions: await this.computePromotionPerformance(outletId, period),
            daily_series: await this.computeDailySeries(outletId, period),
            peak_hours: await this.computePeakHours(outletId, period),
            geographic: await this.computeGeographic(outletId, period),
        };
    }

    static async computeTopFoodItems(outletId: mongoose.Types.ObjectId, period: { start: Date; end: Date }) {
        const foodItemStats = await foodItemAnalyticsRepo.aggregateEvents([
            {
                $match: {
                    outlet_id: outletId,
                    timestamp: { $gte: period.start, $lt: period.end },
                },
            },
            {
                $group: {
                    _id: '$food_item_id',
                    views: { $sum: { $cond: [{ $eq: ['$event_type', 'view'] }, 1, 0] } },
                    impressions: { $sum: { $cond: [{ $eq: ['$event_type', 'impression'] }, 1, 0] } },
                    add_to_cart: { $sum: { $cond: [{ $eq: ['$event_type', 'add_to_cart'] }, 1, 0] } },
                    orders: { $sum: { $cond: [{ $eq: ['$event_type', 'order_created'] }, 1, 0] } },
                },
            },
            { $sort: { views: -1 } },
            { $limit: 10 },
        ]);

        return await Promise.all(
            foodItemStats.map(async (stat: any) => {
                const foodItem = await foodItemRepo.findById(stat._id.toString());
                return {
                    id: stat._id.toString(),
                    name: foodItem?.name || 'Unknown',
                    views: stat.views,
                    impressions: stat.impressions,
                    add_to_cart: stat.add_to_cart,
                    orders: stat.orders,
                    conversion_rate: stat.views > 0 ? parseFloat(((stat.orders / stat.views) * 100).toFixed(2)) : 0,
                    image_url: foodItem?.images?.[0] || undefined,
                };
            })
        );
    }

    static async computeOfferPerformance(outletId: mongoose.Types.ObjectId, period: { start: Date; end: Date }) {
        const offerStats = await offerAnalyticsRepo.aggregateEvents([
            {
                $match: {
                    outlet_id: outletId,
                    timestamp: { $gte: period.start, $lt: period.end },
                },
            },
            {
                $group: {
                    _id: '$offer_id',
                    views: { $sum: { $cond: [{ $in: ['$event_type', ['view', 'impression']] }, 1, 0] } },
                    clicks: { $sum: { $cond: [{ $eq: ['$event_type', 'click'] }, 1, 0] } },
                    code_copies: { $sum: { $cond: [{ $eq: ['$event_type', 'code_copy'] }, 1, 0] } },
                },
            },
            { $sort: { views: -1 } },
        ]);

        const total_views = offerStats.reduce((sum: number, s: any) => sum + s.views, 0);
        let top_offer = null;
        if (offerStats.length > 0) {
            const offer = await offerRepo.findByIdDirect(offerStats[0]._id.toString());
            if (offer) {
                top_offer = {
                    id: offerStats[0]._id.toString(),
                    title: String(offer.title || 'Untitled Offer'),
                    views: offerStats[0].views,
                    clicks: offerStats[0].clicks,
                    code_copies: offerStats[0].code_copies,
                    ctr: offerStats[0].views > 0 ? parseFloat(((offerStats[0].clicks / offerStats[0].views) * 100).toFixed(2)) : 0,
                };
            }
        }

        return {
            total_offers: offerStats.length,
            total_views,
            total_clicks: offerStats.reduce((sum: number, s: any) => sum + s.clicks, 0),
            total_code_copies: offerStats.reduce((sum: number, s: any) => sum + s.code_copies, 0),
            avg_ctr: total_views > 0 ? parseFloat(((offerStats.reduce((sum: number, s: any) => sum + s.clicks, 0) / total_views) * 100).toFixed(2)) : 0,
            top_offer,
        };
    }

    static async computePromotionPerformance(outletId: mongoose.Types.ObjectId, period: { start: Date; end: Date }) {
        const promoStats = await promotionAnalyticsRepo.aggregateEvents([
            {
                $match: {
                    outlet_id: outletId,
                    timestamp: { $gte: period.start, $lt: period.end },
                },
            },
            {
                $group: {
                    _id: '$promotion_id',
                    impressions: { $sum: { $cond: [{ $eq: ['$event_type', 'impression'] }, 1, 0] } },
                    clicks: { $sum: { $cond: [{ $eq: ['$event_type', 'click'] }, 1, 0] } },
                },
            },
            { $sort: { impressions: -1 } },
        ]);

        const total_impressions = promoStats.reduce((sum: number, s: any) => sum + s.impressions, 0);
        let top_promotion = null;
        if (promoStats.length > 0) {
            const promotion = await promotionRepo.findByIdRaw(promoStats[0]._id.toString());
            if (promotion) {
                top_promotion = {
                    id: promoStats[0]._id.toString(),
                    title: promotion.display_data?.banner_text || 'Featured Promotion',
                    impressions: promoStats[0].impressions,
                    clicks: promoStats[0].clicks,
                    ctr: promoStats[0].impressions > 0 ? parseFloat(((promoStats[0].clicks / promoStats[0].impressions) * 100).toFixed(2)) : 0,
                };
            }
        }

        return {
            total_promotions: promoStats.length,
            total_impressions,
            total_clicks: promoStats.reduce((sum: number, s: any) => sum + s.clicks, 0),
            avg_ctr: total_impressions > 0 ? parseFloat(((promoStats.reduce((sum: number, s: any) => sum + s.clicks, 0) / total_impressions) * 100).toFixed(2)) : 0,
            top_promotion,
        };
    }

    static async computeDailySeries(outletId: mongoose.Types.ObjectId, period: { start: Date; end: Date }) {
        const dailyData = await outletAnalyticsEventRepo.aggregateEvents([
            {
                $match: {
                    outlet_id: outletId,
                    timestamp: { $gte: period.start, $lt: period.end },
                },
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: 'UTC' } },
                    visits: { $sum: { $cond: [{ $eq: ['$event_type', 'outlet_visit'] }, 1, 0] } },
                    profile_views: { $sum: { $cond: [{ $eq: ['$event_type', 'profile_view'] }, 1, 0] } },
                    menu_views: { $sum: { $cond: [{ $eq: ['$event_type', 'menu_view'] }, 1, 0] } },
                    sessions: { $addToSet: '$session_id' },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        return dailyData.map((d: any) => ({
            date: d._id,
            visits: d.visits,
            profile_views: d.profile_views,
            menu_views: d.menu_views,
            unique_sessions: d.sessions.length,
        }));
    }

    static async computePeakHours(outletId: mongoose.Types.ObjectId, period: { start: Date; end: Date }) {
        const hourlyData = await outletAnalyticsEventRepo.aggregateEvents([
            {
                $match: { outlet_id: outletId, event_type: 'outlet_visit', timestamp: { $gte: period.start, $lt: period.end } },
            },
            {
                $group: { _id: { $hour: '$timestamp' }, visits: { $sum: 1 } },
            },
            { $sort: { _id: 1 } },
        ]);

        return Array.from({ length: 24 }, (_, hour) => ({
            hour,
            visits: hourlyData.find((d: any) => d._id === hour)?.visits || 0,
        }));
    }

    static async computeGeographic(outletId: mongoose.Types.ObjectId, period: { start: Date; end: Date }) {
        const geoData = await outletAnalyticsEventRepo.aggregateEvents([
            {
                $match: { outlet_id: outletId, timestamp: { $gte: period.start, $lt: period.end }, city: { $exists: true, $ne: null } },
            },
            {
                $group: { _id: { city: '$city', country: '$country' }, count: { $sum: 1 } },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ]);

        const total = geoData.reduce((sum: number, g: any) => sum + g.count, 0) || 1;
        return geoData.map((g: any) => ({
            city: g._id.city || 'Unknown',
            country: g._id.country || 'Unknown',
            count: g.count,
            percentage: parseFloat(((g.count / total) * 100).toFixed(2)),
        }));
    }
}
