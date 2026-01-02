import cron from 'node-cron';
import { Outlet } from '../models/Outlet.js';
import { OutletAnalyticsEvent } from '../models/OutletAnalyticsEvent.js';
import { OutletAnalyticsSummary } from '../models/OutletAnalyticsSummary.js';

export function startOutletAnalyticsAggregation() {
  // Run daily at 2:10 AM (a bit after promotions)
  cron.schedule('10 2 * * *', async () => {
    console.log('[CRON] Starting daily outlet analytics aggregation...');

    try {
      const now = new Date();
      const yesterdayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
      const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

      console.log(`[CRON] Aggregating outlet events for ${yesterdayUtc.toISOString().split('T')[0]} (UTC)`);

      const outlets = await Outlet.find({});

      for (const outlet of outlets) {
        const groups = await OutletAnalyticsEvent.aggregate([
          {
            $match: {
              outlet_id: outlet._id,
              timestamp: { $gte: yesterdayUtc, $lt: todayUtc },
            },
          },
          {
            $group: {
              _id: {
                event_type: '$event_type',
                device_type: '$device_type',
                hour: { $hour: '$timestamp' },
              },
              count: { $sum: 1 },
              unique_sessions: { $addToSet: '$session_id' },
            },
          },
        ]);

        if (groups.length === 0) continue;

        const outlet_visits = groups
          .filter((g: any) => g._id.event_type === 'outlet_visit')
          .reduce((sum: number, g: any) => sum + g.count, 0);

        const profile_views = groups
          .filter((g: any) => g._id.event_type === 'profile_view')
          .reduce((sum: number, g: any) => sum + g.count, 0);

        const menu_views = groups
          .filter((g: any) => g._id.event_type === 'menu_view')
          .reduce((sum: number, g: any) => sum + g.count, 0);

        const allUniqueSessions = new Set(groups.flatMap((g: any) => g.unique_sessions));

        const view_to_menu_rate = profile_views > 0 ? (menu_views / profile_views) * 100 : 0;

        const device_breakdown = {
          mobile: groups.filter((g: any) => g._id.device_type === 'mobile').reduce((s: number, g: any) => s + g.count, 0),
          desktop: groups.filter((g: any) => g._id.device_type === 'desktop').reduce((s: number, g: any) => s + g.count, 0),
          tablet: groups.filter((g: any) => g._id.device_type === 'tablet').reduce((s: number, g: any) => s + g.count, 0),
        };

        const hourly_breakdown = Array.from({ length: 24 }, (_, hour) => {
          const hourEvents = groups.filter((g: any) => g._id.hour === hour);
          return {
            hour,
            profile_views: hourEvents
              .filter((g: any) => g._id.event_type === 'profile_view')
              .reduce((sum: number, g: any) => sum + g.count, 0),
            menu_views: hourEvents
              .filter((g: any) => g._id.event_type === 'menu_view')
              .reduce((sum: number, g: any) => sum + g.count, 0),
          };
        });

        await OutletAnalyticsSummary.findOneAndUpdate(
          { outlet_id: outlet._id, date: yesterdayUtc },
          {
            $set: {
              metrics: {
                outlet_visits,
                profile_views,
                menu_views,
                unique_sessions: allUniqueSessions.size,
                view_to_menu_rate: parseFloat(view_to_menu_rate.toFixed(2)),
              },
              device_breakdown,
              hourly_breakdown,
            },
          },
          { upsert: true, new: true }
        );
      }

      console.log('[CRON] Daily outlet analytics aggregation completed successfully');
    } catch (error) {
      console.error('[CRON] Error during outlet aggregation:', error);
    }
  });

  console.log('[CRON] Outlet analytics aggregation job scheduled (daily at 2:10 AM)');
}
