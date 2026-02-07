import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { FoodItem } from '../models/FoodItem.js';
import { FoodItemAnalyticsEvent } from '../models/FoodItemAnalyticsEvent.js';
import { FoodItemAnalyticsSummary } from '../models/FoodItemAnalyticsSummary.js';

// Load environment variables
dotenv.config();

/**
 * One-time migration to aggregate all historical FoodItemAnalyticsEvent data
 * ONLY migrates data up to YESTERDAY (excludes today)
 */
async function migrateFoodItemAnalytics() {
    try {
        console.log('[FOOD-MIGRATION] Starting historical food item analytics migration...');

        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf';
        await mongoose.connect(mongoUri);
        console.log('[FOOD-MIGRATION] Connected to MongoDB');

        // Get current date to exclude today
        const now = new Date();
        const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

        console.log(`[FOOD-MIGRATION] Today's date (excluded): ${todayUtc.toISOString().split('T')[0]}`);

        // Get all unique dates EXCLUDING TODAY
        const uniqueDates = await FoodItemAnalyticsEvent.aggregate([
            {
                $match: {
                    timestamp: { $lt: todayUtc } // Only dates before today
                }
            },
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

        console.log(`[FOOD-MIGRATION] Found ${uniqueDates.length} unique dates to process (up to yesterday)`);

        const foodItems = await FoodItem.find({}).select('_id outlet_id upvote_count');
        console.log(`[FOOD-MIGRATION] Found ${foodItems.length} food items`);

        let processedCount = 0;

        for (const dateDoc of uniqueDates) {
            const dateStr = dateDoc._id;
            const date = new Date(dateStr);
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);

            console.log(`[FOOD-MIGRATION] Processing date: ${dateStr}`);

            for (const foodItem of foodItems) {
                // Use aggregation for better performance
                const aggregation = await FoodItemAnalyticsEvent.aggregate([
                    {
                        $match: {
                            food_item_id: foodItem._id,
                            timestamp: { $gte: date, $lt: nextDay },
                        }
                    },
                    {
                        $group: {
                            _id: {
                                event_type: '$event_type',
                                source: '$source',
                                device_type: '$device_type',
                            },
                            count: { $sum: 1 }
                        }
                    }
                ]);

                if (aggregation.length === 0) continue;

                // Process metrics
                let views = 0;
                let impressions = 0;
                const source_breakdown: any = {};
                const device_breakdown: any = { mobile: 0, desktop: 0, tablet: 0 };

                aggregation.forEach((item: any) => {
                    const eventType = item._id.event_type;
                    const source = item._id.source || 'other';
                    const deviceType = item._id.device_type;

                    if (eventType === 'item_view') views += item.count;
                    if (eventType === 'item_impression') impressions += item.count;

                    source_breakdown[source] = (source_breakdown[source] || 0) + item.count;
                    device_breakdown[deviceType] = (device_breakdown[deviceType] || 0) + item.count;
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
                                views,
                                impressions, add_to_cart: 0,
                                orders: 0,
                                unique_sessions: 0,
                                view_to_cart_rate: 0,
                                cart_to_order_rate: 0,
                            },
                            source_breakdown,
                            device_breakdown,
                            vote_count: foodItem.upvote_count || 0,
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
        console.log(`[FOOD-MIGRATION] Processed ${uniqueDates.length} dates (up to yesterday)`);
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
