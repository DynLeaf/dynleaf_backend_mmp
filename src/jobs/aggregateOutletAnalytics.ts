import cron from 'node-cron';
import { Outlet } from '../models/Outlet.js';
import { OutletAnalyticsEvent } from '../models/OutletAnalyticsEvent.js';
import { OutletAnalyticsSummary } from '../models/OutletAnalyticsSummary.js';

export function startOutletAnalyticsAggregation() {
  // Run daily at 11:59 PM
  cron.schedule('59 23 * * *', async () => {
    console.log('[CRON] ========================================');
    console.log('[CRON] Starting daily outlet analytics aggregation...');
    console.log('[CRON] Time:', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    console.log('[CRON] ========================================');

    try {
      const now = new Date();
      // Aggregate TODAY's data
      const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const tomorrowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

      console.log(`[CRON] Aggregating data for: ${todayUtc.toISOString().split('T')[0]}`);

      const outlets = await Outlet.find({});
      console.log(`[CRON] Processing ${outlets.length} outlets...`);

      for (const outlet of outlets) {
        const groups = await OutletAnalyticsEvent.aggregate([
          {
            $match: {
              outlet_id: outlet._id,
              timestamp: { $gte: todayUtc, $lt: tomorrowUtc },
            },
          },
          {
            $group: {
              _id: {
                event_type: '$event_type',
                device_type: '$device_type',
                hour: { $hour: '$timestamp' },
                is_qr: {
                  $cond: [
                    { $in: ['$source', ['qr', 'QR', 'qrcode', 'qr_code', 'qr_scan']] },
                    true,
                    false,
                  ],
                },
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

        // QR-specific metrics
        const qr_profile_views = groups
          .filter((g: any) => g._id.event_type === 'profile_view' && g._id.is_qr === true)
          .reduce((sum: number, g: any) => sum + g.count, 0);

        const qr_menu_views = groups
          .filter((g: any) => g._id.event_type === 'menu_view' && g._id.is_qr === true)
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
          { outlet_id: outlet._id, date: todayUtc },
          {
            $set: {
              metrics: {
                outlet_visits,
                profile_views,
                menu_views,
                qr_menu_views,
                qr_profile_views,
                unique_sessions: allUniqueSessions.size,
                view_to_menu_rate: parseFloat(view_to_menu_rate.toFixed(2)),
              },
              device_breakdown,
              hourly_breakdown,
            },
          },
          { upsert: true, new: true }
        );

        console.log(`[CRON] ✓ Processed outlet: ${outlet.name}`);
      }

      console.log('[CRON] ========================================');
      console.log('[CRON] Daily aggregation completed successfully!');
      console.log('[CRON] ========================================');
    } catch (error) {
      console.error('[CRON] Error during aggregation:', error);
    }
  });

  console.log('[CRON] ✅ Outlet analytics aggregation job scheduled (daily at 11:59 PM)');
  console.log('[CRON] Production schedule active');
}
