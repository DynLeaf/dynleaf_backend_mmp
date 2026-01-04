import cron from 'node-cron';
import mongoose from 'mongoose';
import { Outlet } from '../models/Outlet.js';
import { FoodItemAnalyticsEvent } from '../models/FoodItemAnalyticsEvent.js';
import { FoodItemAnalyticsSummary } from '../models/FoodItemAnalyticsSummary.js';

export function startFoodItemAnalyticsAggregation() {
  // Run daily at 2:20 AM UTC-ish (after outlet aggregation)
  cron.schedule('20 2 * * *', async () => {
    console.log('[CRON] Starting daily food item analytics aggregation...');

    try {
      const now = new Date();
      const yesterdayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
      const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

      console.log(`[CRON] Aggregating food item events for ${yesterdayUtc.toISOString().split('T')[0]} (UTC)`);

      const outlets = await Outlet.find({}).select('_id');

      for (const outlet of outlets) {
        const groups = await FoodItemAnalyticsEvent.aggregate([
          {
            $match: {
              outlet_id: outlet._id,
              timestamp: { $gte: yesterdayUtc, $lt: todayUtc },
            },
          },
          {
            $group: {
              _id: {
                food_item_id: '$food_item_id',
                category_id: '$category_id',
                event_type: '$event_type',
                device_type: '$device_type',
                source: '$source',
                hour: { $hour: '$timestamp' },
              },
              count: { $sum: 1 },
              unique_sessions: { $addToSet: '$session_id' },
            },
          },
        ]);

        if (groups.length === 0) continue;

        // bucket by food_item_id
        const byItem = new Map<
          string,
          {
            food_item_id: mongoose.Types.ObjectId;
            category_id?: mongoose.Types.ObjectId;
            impressions: number;
            views: number;
            add_to_cart: number;
            orders: number;
            uniqueSessions: Set<string>;
            device: { mobile: number; desktop: number; tablet: number };
            source: Record<string, number>;
            hourly: Array<{ hour: number; impressions: number; views: number; add_to_cart: number; orders: number }>;
          }
        >();

        const ensure = (foodItemId: mongoose.Types.ObjectId, categoryId?: mongoose.Types.ObjectId) => {
          const key = String(foodItemId);
          const existing = byItem.get(key);
          if (existing) return existing;

          const hourly = Array.from({ length: 24 }, (_, hour) => ({
            hour,
            impressions: 0,
            views: 0,
            add_to_cart: 0,
            orders: 0,
          }));

          const init = {
            food_item_id: foodItemId,
            category_id: categoryId,
            impressions: 0,
            views: 0,
            add_to_cart: 0,
            orders: 0,
            uniqueSessions: new Set<string>(),
            device: { mobile: 0, desktop: 0, tablet: 0 },
            source: {} as Record<string, number>,
            hourly,
          };

          byItem.set(key, init);
          return init;
        };

        for (const g of groups as any[]) {
          const foodItemId = g._id.food_item_id as mongoose.Types.ObjectId;
          const categoryId = g._id.category_id as mongoose.Types.ObjectId | undefined;
          const eventType = g._id.event_type as string;
          const deviceType = g._id.device_type as 'mobile' | 'desktop' | 'tablet';
          const source = (g._id.source as string) || 'other';
          const hour = typeof g._id.hour === 'number' ? g._id.hour : 0;

          const bucket = ensure(foodItemId, categoryId);

          if (eventType === 'item_impression') bucket.impressions += g.count;
          if (eventType === 'item_view') bucket.views += g.count;
          if (eventType === 'add_to_cart') bucket.add_to_cart += g.count;
          if (eventType === 'order_created') bucket.orders += g.count;

          bucket.device[deviceType] += g.count;
          bucket.source[source] = (bucket.source[source] || 0) + g.count;

          const hourRow = bucket.hourly[hour];
          if (hourRow) {
            if (eventType === 'item_impression') hourRow.impressions += g.count;
            if (eventType === 'item_view') hourRow.views += g.count;
            if (eventType === 'add_to_cart') hourRow.add_to_cart += g.count;
            if (eventType === 'order_created') hourRow.orders += g.count;
          }

          for (const sid of g.unique_sessions || []) {
            bucket.uniqueSessions.add(String(sid));
          }
        }

        for (const bucket of byItem.values()) {
          const view_to_cart_rate = bucket.views > 0 ? (bucket.add_to_cart / bucket.views) * 100 : 0;
          const cart_to_order_rate = bucket.add_to_cart > 0 ? (bucket.orders / bucket.add_to_cart) * 100 : 0;

          await FoodItemAnalyticsSummary.findOneAndUpdate(
            {
              outlet_id: outlet._id,
              food_item_id: bucket.food_item_id,
              date: yesterdayUtc,
            },
            {
              $set: {
                category_id: bucket.category_id,
                metrics: {
                  impressions: bucket.impressions,
                  views: bucket.views,
                  add_to_cart: bucket.add_to_cart,
                  orders: bucket.orders,
                  unique_sessions: bucket.uniqueSessions.size,
                  view_to_cart_rate: parseFloat(view_to_cart_rate.toFixed(2)),
                  cart_to_order_rate: parseFloat(cart_to_order_rate.toFixed(2)),
                },
                device_breakdown: bucket.device,
                source_breakdown: bucket.source,
                hourly_breakdown: bucket.hourly,
              },
            },
            { upsert: true, new: true }
          );
        }
      }

      console.log('[CRON] Daily food item analytics aggregation completed successfully');
    } catch (error) {
      console.error('[CRON] Error during food item aggregation:', error);
    }
  });

  console.log('[CRON] Food item analytics aggregation job scheduled (daily at 2:20 AM)');
}
