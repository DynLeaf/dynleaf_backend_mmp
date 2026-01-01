import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { PromotionEvent } from '../models/PromotionEvent.js';
import { PromotionAnalyticsSummary } from '../models/PromotionAnalyticsSummary.js';
import { FeaturedPromotion } from '../models/FeaturedPromotion.js';
import { Outlet } from '../models/Outlet.js';

dotenv.config();

async function aggregateTodayAnalytics() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to MongoDB');

        // Get all events and determine their actual dates
        const allEvents = await PromotionEvent.find({}).sort({ timestamp: -1 }).limit(10);
        console.log('Recent event timestamps:');
        allEvents.forEach(e => {
            console.log(`  ${e.timestamp.toISOString()} (UTC date: ${e.timestamp.toISOString().split('T')[0]})`);
        });
        
        // Get the date from the most recent event
        const latestEvent = allEvents[0];
        if (!latestEvent) {
            console.log('No events found');
            await mongoose.disconnect();
            return;
        }
        
        // Use the UTC date from the timestamp
        const eventDateStr = latestEvent.timestamp.toISOString().split('T')[0]; // "2026-01-01"
        const today = new Date(eventDateStr + 'T00:00:00.000Z');
        const tomorrow = new Date(eventDateStr + 'T00:00:00.000Z');
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        
        console.log(`\nAggregating events for: ${today.toISOString().split('T')[0]} (${today.toISOString()} to ${tomorrow.toISOString()})`);
        
        // Get all promotions
        const promotions = await FeaturedPromotion.find({});
        console.log(`Found ${promotions.length} promotions\n`);
        
        for (const promo of promotions) {
            console.log(`Processing promotion: ${promo._id}`);
            
            // Aggregate events for this promotion
            const events = await PromotionEvent.aggregate([
                {
                    $match: {
                        promotion_id: promo._id,
                        timestamp: { $gte: today, $lt: tomorrow }
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
            await PromotionAnalyticsSummary.findOneAndUpdate(
                {
                    promotion_id: promo._id,
                    date: today
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
            
            console.log(`  ✅ Summary saved for TODAY\n`);
        }
        
        console.log('✅ Aggregation completed successfully\n');
        
        // Show summary
        const totalEvents = await PromotionEvent.countDocuments({});
        const totalSummaries = await PromotionAnalyticsSummary.countDocuments({});
        
        console.log(`Database Summary:`);
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

aggregateTodayAnalytics();
