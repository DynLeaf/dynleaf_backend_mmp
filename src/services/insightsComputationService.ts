import mongoose from 'mongoose';
import { Outlet } from '../models/Outlet.js';
import { OutletAnalyticsEvent } from '../models/OutletAnalyticsEvent.js';
import { FoodItemAnalyticsEvent } from '../models/FoodItemAnalyticsEvent.js';
import { OfferEvent } from '../models/OfferEvent.js';
import { PromotionEvent } from '../models/PromotionEvent.js';
import { FoodItem } from '../models/FoodItem.js';
import { Offer } from '../models/Offer.js';
import { FeaturedPromotion } from '../models/FeaturedPromotion.js';
import { OutletInsightsSummary, IOutletInsightsSummary } from '../models/OutletInsightsSummary.js';

/**
 * Service for computing outlet insights
 * Designed for cron job execution with batch processing
 * Supports: 7d, 30d, 90d (pre-computed) + today (on-demand for premium)
 */

export type TimeRange = '7d' | '30d' | '90d' | 'today';

interface ComputationResult {
    success: boolean;
    outletId: string;
    timeRange: TimeRange | string; // string for custom ranges
    duration: number;
    error?: string;
}

export class InsightsComputationService {
    /**
     * Compute insights for a single outlet and time range
     */
    static async computeForOutlet(
        outletId: string,
        timeRange: TimeRange = '7d',
        customStart?: string,
        customEnd?: string
    ): Promise<ComputationResult> {
        const startTime = Date.now();

        try {
            console.log(`[Insights] Computing ${timeRange} insights for outlet ${outletId}...`);

            const outletObjectId = new mongoose.Types.ObjectId(outletId);

            // Verify outlet exists
            const outlet = await Outlet.findById(outletObjectId);
            if (!outlet) {
                throw new Error(`Outlet ${outletId} not found`);
            }

            // Calculate time periods
            const { currentPeriod, previousPeriod } = this.getTimePeriods(timeRange, customStart, customEnd);

            // Compute all metrics in parallel
            const [basicMetrics, premiumMetrics, trends] = await Promise.all([
                this.computeBasicMetrics(outletObjectId, currentPeriod),
                this.computePremiumMetrics(outletObjectId, currentPeriod),
                this.computeTrends(outletObjectId, currentPeriod, previousPeriod),
            ]);

            // Save to database
            const summary: Partial<IOutletInsightsSummary> = {
                outlet_id: outletObjectId,
                time_range: timeRange,
                computed_at: new Date(),
                period_start: currentPeriod.start,
                period_end: currentPeriod.end,
                ...basicMetrics,
                premium_data: premiumMetrics,
                trends,
                computation_duration_ms: Date.now() - startTime,
                events_processed: basicMetrics.events_processed || 0,
                status: 'success',
            };

            await OutletInsightsSummary.findOneAndUpdate(
                { outlet_id: outletObjectId, time_range: timeRange },
                summary,
                { upsert: true, new: true }
            );

            const duration = Date.now() - startTime;
            console.log(`[Insights] ✅ Computed ${timeRange} for outlet ${outletId} in ${duration}ms`);

            return { success: true, outletId, timeRange, duration };
        } catch (error: any) {
            const duration = Date.now() - startTime;
            console.error(`[Insights] ❌ Failed to compute ${timeRange} for outlet ${outletId}:`, error);

            // Save failed status
            try {
                await OutletInsightsSummary.findOneAndUpdate(
                    { outlet_id: new mongoose.Types.ObjectId(outletId), time_range: timeRange },
                    {
                        status: 'failed',
                        error_message: error.message,
                        computed_at: new Date(),
                        computation_duration_ms: duration,
                    },
                    { upsert: true }
                );
            } catch (saveError) {
                console.error('[Insights] Failed to save error status:', saveError);
            }

            return { success: false, outletId, timeRange, duration, error: error.message };
        }
    }

    /**
     * Compute insights for multiple outlets in batches
     */
    static async computeForOutlets(
        outletIds: string[],
        timeRange: TimeRange = '7d',
        batchSize: number = 10
    ): Promise<ComputationResult[]> {
        const results: ComputationResult[] = [];

        console.log(`[Insights] Computing ${timeRange} for ${outletIds.length} outlets in batches of ${batchSize}...`);

        for (let i = 0; i < outletIds.length; i += batchSize) {
            const batch = outletIds.slice(i, i + batchSize);
            console.log(`[Insights] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(outletIds.length / batchSize)}...`);

            const batchResults = await Promise.all(
                batch.map((outletId) => this.computeForOutlet(outletId, timeRange))
            );

            results.push(...batchResults);

            // Small delay between batches to avoid overwhelming the database
            if (i + batchSize < outletIds.length) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }

        const successful = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;
        console.log(`[Insights] ✅ Completed: ${successful} successful, ${failed} failed`);

        return results;
    }

    /**
     * Compute insights for all active outlets
     */
    static async computeForAllActiveOutlets(timeRange: TimeRange = '7d'): Promise<ComputationResult[]> {
        // Get all outlets that have had activity in the last 90 days
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const activeOutletIds = await OutletAnalyticsEvent.distinct('outlet_id', {
            timestamp: { $gte: ninetyDaysAgo },
        });

        console.log(`[Insights] Found ${activeOutletIds.length} active outlets`);

        return this.computeForOutlets(
            activeOutletIds.map((id) => id.toString()),
            timeRange
        );
    }

    /**
     * Get time periods for current and previous ranges
     */
    private static getTimePeriods(timeRange: TimeRange, customStart?: string, customEnd?: string) {
        // IST timezone offset: UTC + 5:30
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

        // Get current time in IST
        const nowUTC = new Date();
        const nowIST = new Date(nowUTC.getTime() + IST_OFFSET_MS);

        let currentStart: Date;
        let currentEnd: Date;

        switch (timeRange) {
            case 'today': {
                // Today in IST: 00:00 IST to current time IST
                const todayStartIST = new Date(nowIST);
                todayStartIST.setHours(0, 0, 0, 0);

                currentStart = new Date(todayStartIST.getTime() - IST_OFFSET_MS); // Convert back to UTC
                currentEnd = nowUTC; // Current time in UTC
                break;
            }

            case '7d':
            case '30d':
            case '90d':
            default: {
                // Standard ranges: last N days in IST
                const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;

                const endIST = new Date(nowIST);
                const startIST = new Date(nowIST);
                startIST.setDate(startIST.getDate() - days);

                currentStart = new Date(startIST.getTime() - IST_OFFSET_MS); // Convert to UTC
                currentEnd = new Date(endIST.getTime() - IST_OFFSET_MS); // Convert to UTC
                break;
            }
        }

        // Calculate previous period (for trends comparison)
        const periodDuration = currentEnd.getTime() - currentStart.getTime();
        const previousEnd = new Date(currentStart);
        const previousStart = new Date(currentStart.getTime() - periodDuration);

        return {
            currentPeriod: { start: currentStart, end: currentEnd },
            previousPeriod: { start: previousStart, end: previousEnd },
        };
    }

    /**
     * Compute basic metrics (shown to free tier)
     */
    private static async computeBasicMetrics(
        outletId: mongoose.Types.ObjectId,
        period: { start: Date; end: Date }
    ) {
        // Get outlet analytics events
        const events = await OutletAnalyticsEvent.find({
            outlet_id: outletId,
            timestamp: { $gte: period.start, $lt: period.end },
        });

        const total_visits = events.filter((e) => e.event_type === 'outlet_visit').length;
        const total_menu_views = events.filter((e) => e.event_type === 'menu_view').length;
        const total_profile_views = events.filter((e) => e.event_type === 'profile_view').length;
        const unique_visitors = new Set(events.map((e) => e.session_id)).size;

        // Device breakdown
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

        // Top food item
        const foodItemEvents = await FoodItemAnalyticsEvent.aggregate([
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
            const foodItem = await FoodItem.findById(topItemId).select('name images');
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

    /**
     * Compute premium metrics (locked for free tier)
     */
    private static async computePremiumMetrics(
        outletId: mongoose.Types.ObjectId,
        period: { start: Date; end: Date }
    ) {
        // Get all events for the period
        const events = await OutletAnalyticsEvent.find({
            outlet_id: outletId,
            timestamp: { $gte: period.start, $lt: period.end },
        }).sort({ timestamp: 1 });

        // Session-level aggregation
        const sessions = await OutletAnalyticsEvent.aggregate([
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
                    has_visit: {
                        $max: {
                            $cond: [{ $eq: ['$event_type', 'outlet_visit'] }, 1, 0],
                        },
                    },
                    has_profile: {
                        $max: {
                            $cond: [{ $eq: ['$event_type', 'profile_view'] }, 1, 0],
                        },
                    },
                    has_menu: {
                        $max: {
                            $cond: [{ $eq: ['$event_type', 'menu_view'] }, 1, 0],
                        },
                    },
                },
            },
        ]);

        // Funnel metrics
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

        // Audience insights (new vs returning)
        const sessionIds = sessions.map((s: any) => s._id).filter((sid: any) => sid && sid !== 'anonymous');
        let new_sessions = 0;
        let returning_sessions = 0;

        if (sessionIds.length > 0 && sessionIds.length <= 5000) {
            const priorSessions = await OutletAnalyticsEvent.distinct('session_id', {
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

        // Traffic sources
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

        // Entry pages
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

        // Top 10 food items with full metrics
        const top_food_items = await this.computeTopFoodItems(outletId, period);

        // Offer performance
        const offers = await this.computeOfferPerformance(outletId, period);

        // Promotion performance
        const promotions = await this.computePromotionPerformance(outletId, period);

        // Daily series
        const daily_series = await this.computeDailySeries(outletId, period);

        // Peak hours
        const peak_hours = await this.computePeakHours(outletId, period);

        // Geographic breakdown
        const geographic = await this.computeGeographic(outletId, period);

        return {
            funnel,
            audience,
            sources,
            entry_pages,
            top_food_items,
            offers,
            promotions,
            daily_series,
            peak_hours,
            geographic,
        };
    }

    /**
     * Compute top food items with full metrics
     */
    private static async computeTopFoodItems(outletId: mongoose.Types.ObjectId, period: { start: Date; end: Date }) {
        const foodItemStats = await FoodItemAnalyticsEvent.aggregate([
            {
                $match: {
                    outlet_id: outletId,
                    timestamp: { $gte: period.start, $lt: period.end },
                },
            },
            {
                $group: {
                    _id: '$food_item_id',
                    views: {
                        $sum: {
                            $cond: [{ $eq: ['$event_type', 'view'] }, 1, 0],
                        },
                    },
                    impressions: {
                        $sum: {
                            $cond: [{ $eq: ['$event_type', 'impression'] }, 1, 0],
                        },
                    },
                    add_to_cart: {
                        $sum: {
                            $cond: [{ $eq: ['$event_type', 'add_to_cart'] }, 1, 0],
                        },
                    },
                    orders: {
                        $sum: {
                            $cond: [{ $eq: ['$event_type', 'order_created'] }, 1, 0],
                        },
                    },
                },
            },
            { $sort: { views: -1 } },
            { $limit: 10 },
        ]);

        const top_food_items = await Promise.all(
            foodItemStats.map(async (stat: any) => {
                const foodItem = await FoodItem.findById(stat._id).select('name images');
                const conversion_rate = stat.views > 0 ? parseFloat(((stat.orders / stat.views) * 100).toFixed(2)) : 0;

                return {
                    id: stat._id.toString(),
                    name: foodItem?.name || 'Unknown',
                    views: stat.views,
                    impressions: stat.impressions,
                    add_to_cart: stat.add_to_cart,
                    orders: stat.orders,
                    conversion_rate,
                    image_url: foodItem?.images?.[0] || undefined,
                };
            })
        );

        return top_food_items;
    }

    /**
     * Compute offer performance
     */
    private static async computeOfferPerformance(outletId: mongoose.Types.ObjectId, period: { start: Date; end: Date }) {
        const offerStats = await OfferEvent.aggregate([
            {
                $match: {
                    outlet_id: outletId,
                    timestamp: { $gte: period.start, $lt: period.end },
                },
            },
            {
                $group: {
                    _id: '$offer_id',
                    views: {
                        $sum: {
                            $cond: [{ $in: ['$event_type', ['view', 'impression']] }, 1, 0],
                        },
                    },
                    clicks: {
                        $sum: {
                            $cond: [{ $eq: ['$event_type', 'click'] }, 1, 0],
                        },
                    },
                    code_copies: {
                        $sum: {
                            $cond: [{ $eq: ['$event_type', 'code_copy'] }, 1, 0],
                        },
                    },
                },
            },
            { $sort: { views: -1 } },
        ]);

        const total_offers = offerStats.length;
        const total_views = offerStats.reduce((sum: number, s: any) => sum + s.views, 0);
        const total_clicks = offerStats.reduce((sum: number, s: any) => sum + s.clicks, 0);
        const total_code_copies = offerStats.reduce((sum: number, s: any) => sum + s.code_copies, 0);
        const avg_ctr = total_views > 0 ? parseFloat(((total_clicks / total_views) * 100).toFixed(2)) : 0;

        let top_offer = null;
        if (offerStats.length > 0) {
            const topStat = offerStats[0];
            const offer = await Offer.findById(topStat._id).select('title');
            if (offer) {
                top_offer = {
                    id: topStat._id.toString(),
                    title: String(offer.title || 'Untitled Offer'),
                    views: topStat.views,
                    clicks: topStat.clicks,
                    code_copies: topStat.code_copies,
                    ctr: topStat.views > 0 ? parseFloat(((topStat.clicks / topStat.views) * 100).toFixed(2)) : 0,
                };
            }
        }

        return {
            total_offers,
            total_views,
            total_clicks,
            total_code_copies,
            avg_ctr,
            top_offer,
        };
    }

    /**
     * Compute promotion performance
     */
    private static async computePromotionPerformance(
        outletId: mongoose.Types.ObjectId,
        period: { start: Date; end: Date }
    ) {
        const promoStats = await PromotionEvent.aggregate([
            {
                $match: {
                    outlet_id: outletId,
                    timestamp: { $gte: period.start, $lt: period.end },
                },
            },
            {
                $group: {
                    _id: '$promotion_id',
                    impressions: {
                        $sum: {
                            $cond: [{ $eq: ['$event_type', 'impression'] }, 1, 0],
                        },
                    },
                    clicks: {
                        $sum: {
                            $cond: [{ $eq: ['$event_type', 'click'] }, 1, 0],
                        },
                    },
                },
            },
            { $sort: { impressions: -1 } },
        ]);

        const total_promotions = promoStats.length;
        const total_impressions = promoStats.reduce((sum: number, s: any) => sum + s.impressions, 0);
        const total_clicks = promoStats.reduce((sum: number, s: any) => sum + s.clicks, 0);
        const avg_ctr = total_impressions > 0 ? parseFloat(((total_clicks / total_impressions) * 100).toFixed(2)) : 0;

        let top_promotion = null;
        if (promoStats.length > 0) {
            const topStat = promoStats[0];
            const promotion = await FeaturedPromotion.findById(topStat._id).select('display_data');
            if (promotion) {
                top_promotion = {
                    id: topStat._id.toString(),
                    title: promotion.display_data?.banner_text || 'Featured Promotion',
                    impressions: topStat.impressions,
                    clicks: topStat.clicks,
                    ctr: topStat.impressions > 0 ? parseFloat(((topStat.clicks / topStat.impressions) * 100).toFixed(2)) : 0,
                };
            }
        }

        return {
            total_promotions,
            total_impressions,
            total_clicks,
            avg_ctr,
            top_promotion,
        };
    }

    /**
     * Compute daily series
     */
    private static async computeDailySeries(outletId: mongoose.Types.ObjectId, period: { start: Date; end: Date }) {
        const dailyData = await OutletAnalyticsEvent.aggregate([
            {
                $match: {
                    outlet_id: outletId,
                    timestamp: { $gte: period.start, $lt: period.end },
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$timestamp',
                            timezone: 'UTC',
                        },
                    },
                    visits: {
                        $sum: {
                            $cond: [{ $eq: ['$event_type', 'outlet_visit'] }, 1, 0],
                        },
                    },
                    profile_views: {
                        $sum: {
                            $cond: [{ $eq: ['$event_type', 'profile_view'] }, 1, 0],
                        },
                    },
                    menu_views: {
                        $sum: {
                            $cond: [{ $eq: ['$event_type', 'menu_view'] }, 1, 0],
                        },
                    },
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

    /**
     * Compute peak hours
     */
    private static async computePeakHours(outletId: mongoose.Types.ObjectId, period: { start: Date; end: Date }) {
        const hourlyData = await OutletAnalyticsEvent.aggregate([
            {
                $match: {
                    outlet_id: outletId,
                    event_type: 'outlet_visit',
                    timestamp: { $gte: period.start, $lt: period.end },
                },
            },
            {
                $group: {
                    _id: { $hour: '$timestamp' },
                    visits: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // Fill in missing hours with 0
        const peak_hours = Array.from({ length: 24 }, (_, hour) => {
            const data = hourlyData.find((d: any) => d._id === hour);
            return {
                hour,
                visits: data?.visits || 0,
            };
        });

        return peak_hours;
    }

    /**
     * Compute geographic breakdown
     */
    private static async computeGeographic(outletId: mongoose.Types.ObjectId, period: { start: Date; end: Date }) {
        const geoData = await OutletAnalyticsEvent.aggregate([
            {
                $match: {
                    outlet_id: outletId,
                    timestamp: { $gte: period.start, $lt: period.end },
                    city: { $exists: true, $ne: null },
                },
            },
            {
                $group: {
                    _id: {
                        city: '$city',
                        country: '$country',
                    },
                    count: { $sum: 1 },
                },
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

    /**
     * Compute trends (comparison with previous period)
     */
    private static async computeTrends(
        outletId: mongoose.Types.ObjectId,
        currentPeriod: { start: Date; end: Date },
        previousPeriod: { start: Date; end: Date }
    ) {
        const [currentMetrics, previousMetrics] = await Promise.all([
            this.computeBasicMetrics(outletId, currentPeriod),
            this.computeBasicMetrics(outletId, previousPeriod),
        ]);

        const calculateChange = (current: number, previous: number) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return parseFloat((((current - previous) / previous) * 100).toFixed(2));
        };

        return {
            visits_change_pct: calculateChange(currentMetrics.total_visits, previousMetrics.total_visits),
            menu_views_change_pct: calculateChange(currentMetrics.total_menu_views, previousMetrics.total_menu_views),
            profile_views_change_pct: calculateChange(currentMetrics.total_profile_views, previousMetrics.total_profile_views),
            unique_visitors_change_pct: calculateChange(currentMetrics.unique_visitors, previousMetrics.unique_visitors),
        };
    }
}
