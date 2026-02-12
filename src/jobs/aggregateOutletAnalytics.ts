import cron from 'node-cron';
import { Outlet } from '../models/Outlet.js';
import { OutletAnalyticsEvent } from '../models/OutletAnalyticsEvent.js';
import { OutletAnalyticsSummary } from '../models/OutletAnalyticsSummary.js';

export function startOutletAnalyticsAggregation() {
  // Run daily at 12:00 AM (midnight) to aggregate YESTERDAY's complete data
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] ========================================');
    console.log('[CRON] Starting daily outlet analytics aggregation...');
    console.log('[CRON] Time:', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    console.log('[CRON] ========================================');

    try {
      const now = new Date();
      // Aggregate YESTERDAY's data (the day that just completed)
      const yesterdayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
      const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

      console.log(`[CRON] Aggregating data for: ${yesterdayUtc.toISOString().split('T')[0]}`);

      const outlets = await Outlet.find({});
      console.log(`[CRON] Processing ${outlets.length} outlets...`);

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
                source: '$source', // Group by source for breakdown
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

        // Helper function to aggregate source counts
        const aggregateSourceCounts = (eventType: string) => {
          const sourceGroups = groups.filter((g: any) => g._id.event_type === eventType);
          const sourceCounts: any = {
            qr_scan: 0,
            whatsapp: 0,
            link: 0,
            telegram: 0,
            twitter: 0,
            share: 0,
            search: 0,
            home: 0,
            menu_page: 0,
            profile_page: 0,
            direct_url: 0,
            other: 0,
          };

          sourceGroups.forEach((g: any) => {
            const source = (g._id.source || 'other').toLowerCase();

            // Normalize source values
            if (source === 'qr' || source === 'qr_scan' || source === 'qr_code' || source === 'qrcode') {
              sourceCounts.qr_scan += g.count;
            } else if (source === 'whatsapp') {
              sourceCounts.whatsapp += g.count;
            } else if (source === 'link') {
              sourceCounts.link += g.count;
            } else if (source === 'telegram') {
              sourceCounts.telegram += g.count;
            } else if (source === 'twitter' || source === 'x') {
              sourceCounts.twitter += g.count;
            } else if (source === 'share') {
              sourceCounts.share += g.count;
            } else if (source === 'search') {
              sourceCounts.search += g.count;
            } else if (source === 'home') {
              sourceCounts.home += g.count;
            } else if (source === 'menu_page') {
              sourceCounts.menu_page += g.count;
            } else if (source === 'profile_page') {
              sourceCounts.profile_page += g.count;
            } else if (source === 'direct_url') {
              sourceCounts.direct_url += g.count;
            } else {
              sourceCounts.other += g.count;
            }
          });

          return sourceCounts;
        };

        // Calculate source breakdowns
        const profile_view_sources = aggregateSourceCounts('profile_view');
        const menu_view_sources = aggregateSourceCounts('menu_view');

        await OutletAnalyticsSummary.findOneAndUpdate(
          { outlet_id: outlet._id, date: yesterdayUtc },
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
                profile_view_sources,
                menu_view_sources,
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

  console.log('[CRON] ✅ Outlet analytics aggregation job scheduled (daily at 12:00 AM midnight)');
  console.log('[CRON] Aggregates previous day\'s complete data (00:00 to 23:59:59)');
}
