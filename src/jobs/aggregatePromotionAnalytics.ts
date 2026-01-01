import cron from 'node-cron';
import { PromotionEvent } from '../models/PromotionEvent.js';
import { PromotionAnalyticsSummary } from '../models/PromotionAnalyticsSummary.js';
import { FeaturedPromotion } from '../models/FeaturedPromotion.js';

export function startAnalyticsAggregation() {
    // Run daily at 2:00 AM
    cron.schedule('0 2 * * *', async () => {
        console.log('[CRON] Starting daily promotion analytics aggregation...');
        
        try {
            // Get yesterday's date range (UTC) to avoid timezone drift.
            const now = new Date();
            const yesterdayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
            const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

            console.log(`[CRON] Aggregating events for ${yesterdayUtc.toISOString().split('T')[0]} (UTC)`);
            
            // Get all promotions
            const promotions = await FeaturedPromotion.find({});
            
            for (const promo of promotions) {
                // Aggregate events for this promotion
                const events = await PromotionEvent.aggregate([
                    {
                        $match: {
                            promotion_id: promo._id,
                            timestamp: { $gte: yesterdayUtc, $lt: todayUtc }
                        }
                    },
                    {
                        $group: {
                            _id: {
                                event_type: '$event_type',
                                device_type: '$device_type',
                                hour: { $hour: '$timestamp' }
                            },
                            count: { $sum: 1 },
                            unique_sessions: { $addToSet: '$session_id' }
                        }
                    }
                ]);
                
                if (events.length === 0) {
                    console.log(`[CRON] No events for promotion ${promo._id}`);
                    continue;
                }
                
                // Calculate metrics
                const impressions = events
                    .filter(e => e._id.event_type === 'impression')
                    .reduce((sum, e) => sum + e.count, 0);
                
                const clicks = events
                    .filter(e => e._id.event_type === 'click')
                    .reduce((sum, e) => sum + e.count, 0);
                
                const menu_views = events
                    .filter(e => e._id.event_type === 'menu_view')
                    .reduce((sum, e) => sum + e.count, 0);
                
                const allUniqueSessions = new Set(
                    events.flatMap(e => e.unique_sessions)
                );
                
                const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
                const conversion_rate = clicks > 0 ? (menu_views / clicks) * 100 : 0;
                
                // Device breakdown
                const device_breakdown = {
                    mobile: events
                        .filter(e => e._id.device_type === 'mobile')
                        .reduce((sum, e) => sum + e.count, 0),
                    desktop: events
                        .filter(e => e._id.device_type === 'desktop')
                        .reduce((sum, e) => sum + e.count, 0),
                    tablet: events
                        .filter(e => e._id.device_type === 'tablet')
                        .reduce((sum, e) => sum + e.count, 0)
                };
                
                // Hourly breakdown
                const hourly_breakdown = Array.from({ length: 24 }, (_, hour) => {
                    const hourEvents = events.filter(e => e._id.hour === hour);
                    return {
                        hour,
                        impressions: hourEvents
                            .filter(e => e._id.event_type === 'impression')
                            .reduce((sum, e) => sum + e.count, 0),
                        clicks: hourEvents
                            .filter(e => e._id.event_type === 'click')
                            .reduce((sum, e) => sum + e.count, 0)
                    };
                });
                
                // Save or update summary
                await PromotionAnalyticsSummary.findOneAndUpdate(
                    {
                        promotion_id: promo._id,
                        date: yesterdayUtc
                    },
                    {
                        $set: {
                            outlet_id: promo.outlet_id,
                            metrics: {
                                impressions,
                                clicks,
                                menu_views,
                                unique_sessions: allUniqueSessions.size,
                                ctr: parseFloat(ctr.toFixed(2)),
                                conversion_rate: parseFloat(conversion_rate.toFixed(2))
                            },
                            device_breakdown,
                            hourly_breakdown,
                            location_breakdown: new Map() // TODO: Add location aggregation
                        }
                    },
                    { upsert: true, new: true }
                );
                
                console.log(`[CRON] Aggregated ${events.length} event groups for promotion ${promo._id}`);
            }
            
            console.log('[CRON] Daily aggregation completed successfully');
            
        } catch (error) {
            console.error('[CRON] Error during aggregation:', error);
        }
    });
    
    console.log('[CRON] Analytics aggregation job scheduled (daily at 2:00 AM)');
}
