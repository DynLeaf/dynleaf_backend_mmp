import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { PromotionEvent } from '../models/PromotionEvent.js';
import { PromotionAnalyticsSummary } from '../models/PromotionAnalyticsSummary.js';
import { FeaturedPromotion } from '../models/FeaturedPromotion.js';
import { Outlet } from '../models/Outlet.js';

dotenv.config();

async function aggregateAnalytics() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to MongoDB');

        // Get yesterday's date range
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        
        const today = new Date(yesterday);
        today.setDate(today.getDate() + 1);
        
        console.log(`Aggregating events for ${yesterday.toISOString().split('T')[0]}`);
        
        // Get all promotions
        const promotions = await FeaturedPromotion.find({});
        console.log(`Found ${promotions.length} promotions`);
        
        for (const promo of promotions) {
            console.log(`\nProcessing promotion: ${promo._id}`);
            
            // Aggregate events for this promotion
            const events = await PromotionEvent.aggregate([
                {
                    $match: {
                        promotion_id: promo._id,
                        timestamp: { $gte: yesterday, $lt: today }
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
                console.log(`  No events for promotion ${promo._id}`);
                continue;
            }
            
            console.log(`  Found ${events.length} event groups`);
            
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
            
            console.log(`  Impressions: ${impressions}, Clicks: ${clicks}, CTR: ${ctr.toFixed(2)}%`);
            
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
            const summary = await PromotionAnalyticsSummary.findOneAndUpdate(
                {
                    promotion_id: promo._id,
                    date: yesterday
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
                        location_breakdown: new Map()
                    }
                },
                { upsert: true, new: true }
            );
            
            console.log(`  ✅ Summary saved for ${yesterday.toISOString().split('T')[0]}`);
        }
        
        console.log('\n✅ Aggregation completed successfully');
        
        // Show summary of all events
        const totalEvents = await PromotionEvent.countDocuments({});
        const totalSummaries = await PromotionAnalyticsSummary.countDocuments({});
        
        console.log(`\nDatabase Summary:`);
        console.log(`  Total Events: ${totalEvents}`);
        console.log(`  Total Daily Summaries: ${totalSummaries}`);
        
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
        
    } catch (error) {
        console.error('Error during aggregation:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

aggregateAnalytics();
