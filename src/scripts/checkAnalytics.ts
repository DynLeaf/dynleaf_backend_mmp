import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { PromotionEvent } from '../models/PromotionEvent.js';
import { PromotionAnalyticsSummary } from '../models/PromotionAnalyticsSummary.js';
import { FeaturedPromotion } from '../models/FeaturedPromotion.js';
import { Outlet } from '../models/Outlet.js';

dotenv.config();

async function checkAnalytics() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('✅ Connected to MongoDB\n');

        // Check promotions
        const promotions = await FeaturedPromotion.find({});
        console.log(`📊 Active Promotions: ${promotions.length}`);
        promotions.forEach((promo: any) => {
            console.log(`  - Promotion ID: ${promo._id}`);
            console.log(`    Status: ${promo.is_active ? 'Active' : 'Inactive'}`);
            console.log(`    Legacy Stats: ${promo.analytics?.impressions || 0} impressions, ${promo.analytics?.clicks || 0} clicks`);
        });

        // Check events
        console.log(`\n📈 Promotion Events:`);
        const totalEvents = await PromotionEvent.countDocuments({});
        console.log(`  Total Events: ${totalEvents}`);
        
        if (totalEvents > 0) {
            const eventsByType = await PromotionEvent.aggregate([
                {
                    $group: {
                        _id: '$event_type',
                        count: { $sum: 1 }
                    }
                }
            ]);
            
            eventsByType.forEach((stat: any) => {
                console.log(`    ${stat._id}: ${stat.count}`);
            });

            // Show recent events
            const recentEvents = await PromotionEvent.find({})
                .sort({ timestamp: -1 })
                .limit(5);
            
            console.log(`\n  Recent Events (last 5):`);
            recentEvents.forEach((event: any) => {
                console.log(`    ${event.timestamp.toISOString()} - ${event.event_type} - ${event.device_type}`);
                console.log(`      Promotion: ${event.promotion_id}`);
                console.log(`      Session: ${event.session_id}`);
            });
        } else {
            console.log(`  ⚠️  No events found. Make sure tracking is working on the frontend.`);
        }

        // Check summaries
        console.log(`\n📊 Analytics Summaries:`);
        const totalSummaries = await PromotionAnalyticsSummary.countDocuments({});
        console.log(`  Total Daily Summaries: ${totalSummaries}`);
        
        if (totalSummaries > 0) {
            const recentSummaries = await PromotionAnalyticsSummary.find({})
                .sort({ date: -1 })
                .limit(3);
            
            console.log(`\n  Recent Summaries:`);
            recentSummaries.forEach((summary: any) => {
                console.log(`    ${summary.date.toISOString().split('T')[0]} - Promotion: ${summary.promotion_id}`);
                console.log(`      Impressions: ${summary.metrics.impressions}, Clicks: ${summary.metrics.clicks}`);
                console.log(`      CTR: ${summary.metrics.ctr}%, Unique Sessions: ${summary.metrics.unique_sessions}`);
                console.log(`      Devices: Mobile=${summary.device_breakdown.mobile}, Desktop=${summary.device_breakdown.desktop}`);
            });
        } else {
            console.log(`  ℹ️  No summaries yet. Run aggregation script or wait for the daily cron job.`);
        }

        console.log(`\n✅ Check complete`);
        
        await mongoose.disconnect();
        
    } catch (error) {
        console.error('❌ Error checking analytics:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

checkAnalytics();
