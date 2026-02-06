import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { FoodItem } from '../models/FoodItem.js';
import { FoodItemAnalyticsEvent } from '../models/FoodItemAnalyticsEvent.js';
import { FoodItemAnalyticsSummary } from '../models/FoodItemAnalyticsSummary.js';

// Load environment variables
dotenv.config();

/**
 * One-time migration to aggregate all historical FoodItemAnalyticsEvent data
 */
async function migrateFoodItemAnalytics() {
    try {
        console.log('[FOOD-MIGRATION] Starting historical food item analytics migration...');

        const mongoUri = ''
        await mongoose.connect(mongoUri);
        console.log('[FOOD-MIGRATION] Connected to MongoDB');

        // Get all unique dates
        const uniqueDates = await FoodItemAnalyticsEvent.aggregate([
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$timestamp',
                        },
                    },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        console.log(`[FOOD-MIGRATION] Found ${uniqueDates.length} unique dates to process`);

        const foodItems = await FoodItem.find({}).select('_id outlet_id');
        console.log(`[FOOD-MIGRATION] Found ${foodItems.length} food items`);

        let processedCount = 0;

        for (const dateDoc of uniqueDates) {
            const dateStr = dateDoc._id;
            const date = new Date(dateStr);
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);

            console.log(`[FOOD-MIGRATION] Processing date: ${dateStr}`);

            for (const foodItem of foodItems) {
                const events = await FoodItemAnalyticsEvent.find({
                    food_item_id: foodItem._id,
                    timestamp: { $gte: date, $lt: nextDay },
                }).lean();

                if (events.length === 0) continue;

                const total_views = events.length;

                // Count source breakdown
                const source_breakdown: any = {
                    home: 0,
                    homepage_trending: 0,
                    menu: 0,
                };

                events.forEach((event: any) => {
                    if (event.source === 'home') source_breakdown.home++;
                    else if (event.source === 'homepage_trending') source_breakdown.homepage_trending++;
                    else if (event.source === 'menu') source_breakdown.menu++;
                });

                // Device breakdown
                const device_breakdown: any = {
                    mobile: 0,
                    desktop: 0,
                    tablet: 0,
                };

                events.forEach((event: any) => {
                    if (event.device_type === 'mobile') device_breakdown.mobile++;
                    else if (event.device_type === 'desktop') device_breakdown.desktop++;
                    else if (event.device_type === 'tablet') device_breakdown.tablet++;
                });

                await FoodItemAnalyticsSummary.findOneAndUpdate(
                    {
                        food_item_id: foodItem._id,
                        outlet_id: foodItem.outlet_id,
                        date: date,
                    },
                    {
                        $set: {
                            metrics: {
                                views: total_views,
                            },
                            source_breakdown,
                            device_breakdown,
                        },
                    },
                    { upsert: true, new: true }
                );

                processedCount++;
            }

            console.log(`[FOOD-MIGRATION] ✓ Completed date: ${dateStr}`);
        }

        console.log(`[FOOD-MIGRATION] ========================================`);
        console.log(`[FOOD-MIGRATION] Migration completed successfully!`);
        console.log(`[FOOD-MIGRATION] Processed ${uniqueDates.length} dates`);
        console.log(`[FOOD-MIGRATION] Created/Updated ${processedCount} summary records`);
        console.log(`[FOOD-MIGRATION] ========================================`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('[FOOD-MIGRATION] Error:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

migrateFoodItemAnalytics();
