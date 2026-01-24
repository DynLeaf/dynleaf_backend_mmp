import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Outlet } from '../models/Outlet.js';
import { OutletAnalyticsEvent } from '../models/OutletAnalyticsEvent.js';
import { OutletAnalyticsSummary } from '../models/OutletAnalyticsSummary.js';
import { sendSuccess, sendError } from '../utils/response.js';
import * as outletService from '../services/outletService.js';

const detectDeviceType = (userAgentRaw: string): 'mobile' | 'desktop' | 'tablet' => {
  const userAgent = userAgentRaw || '';
  if (/mobile/i.test(userAgent) && !/tablet|ipad/i.test(userAgent)) return 'mobile';
  if (/tablet|ipad/i.test(userAgent)) return 'tablet';
  return 'desktop';
};

const getIpAddress = (req: Request) =>
  (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress;

type OutletTrackBody = {
  session_id?: string;
  entry_page?: 'menu' | 'profile';
  source?: string;
  prev_path?: string;
  promotion_id?: string;
};

const toObjectIdOrUndefined = (value?: string) => {
  if (!value) return undefined;
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : undefined;
};

export const trackOutletVisit = async (req: Request, res: Response) => {
  try {
    const { outletId } = req.params;
    console.log(`[trackOutletVisit] Tracking outlet: ${outletId}`);
    const { session_id, entry_page, source, prev_path, promotion_id } = req.body as OutletTrackBody;

    const outlet = await outletService.getOutletById(outletId);
    if (!outlet) return sendError(res, 'Outlet not found', 404);

    const userAgent = (req.headers['user-agent'] as string) || '';
    const device_type = detectDeviceType(userAgent);
    const ip_address = getIpAddress(req);

    const sid = session_id || 'anonymous';

    // Dedupe: same outlet+session within last 30 minutes.
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const recent = await OutletAnalyticsEvent.findOne({
      outlet_id: outlet._id,
      session_id: sid,
      event_type: 'outlet_visit',
      timestamp: { $gte: thirtyMinutesAgo },
    }).select('_id');

    if (recent) return sendSuccess(res, { tracked: false, deduped: true });

    console.log(`[trackOutletVisit] Creating event for ID: ${outlet._id}`);
    await OutletAnalyticsEvent.create({
      outlet_id: outlet._id,
      event_type: 'outlet_visit',
      session_id: sid,
      device_type,
      user_agent: userAgent,
      ip_address,
      entry_page,
      source,
      prev_path,
      promotion_id: toObjectIdOrUndefined(promotion_id),
      timestamp: new Date(),
    });

    return sendSuccess(res, { tracked: true });
  } catch (error: any) {
    console.error('[trackOutletVisit] FATAL ERROR:', error);
    console.error(error.stack);
    return sendError(res, `Visit tracking failed: ${error.message}`);
  }
};

export const trackOutletProfileView = async (req: Request, res: Response) => {
  try {
    const { outletId } = req.params;
    const { session_id, entry_page, source, prev_path, promotion_id } = req.body as OutletTrackBody;

    const outlet = await outletService.getOutletById(outletId);
    if (!outlet) return sendError(res, 'Outlet not found', 404);

    const userAgent = (req.headers['user-agent'] as string) || '';
    const device_type = detectDeviceType(userAgent);
    const ip_address = getIpAddress(req);

    console.log(`[trackOutletProfileView] Creating event for ID: ${outlet._id}`);
    await OutletAnalyticsEvent.create({
      outlet_id: outlet._id,
      event_type: 'profile_view',
      session_id: session_id || 'anonymous',
      device_type,
      user_agent: userAgent,
      ip_address,
      entry_page,
      source,
      prev_path,
      promotion_id: toObjectIdOrUndefined(promotion_id),
      timestamp: new Date(),
    });

    return sendSuccess(res, { tracked: true });
  } catch (error: any) {
    console.error('[trackOutletProfileView] FATAL ERROR:', error);
    console.error(error.stack);
    return sendError(res, `Profile view tracking failed: ${error.message}`);
  }
};

export const trackOutletMenuView = async (req: Request, res: Response) => {
  try {
    const { outletId } = req.params;
    const { session_id, entry_page, source, prev_path, promotion_id } = req.body as OutletTrackBody;

    const outlet = await outletService.getOutletById(outletId);
    if (!outlet) return sendError(res, 'Outlet not found', 404);

    const userAgent = (req.headers['user-agent'] as string) || '';
    const device_type = detectDeviceType(userAgent);
    const ip_address = getIpAddress(req);

    console.log(`[trackOutletMenuView] Creating event for ID: ${outlet._id}`);
    await OutletAnalyticsEvent.create({
      outlet_id: outlet._id,
      event_type: 'menu_view',
      session_id: session_id || 'anonymous',
      device_type,
      user_agent: userAgent,
      ip_address,
      entry_page,
      source,
      prev_path,
      promotion_id: toObjectIdOrUndefined(promotion_id),
      timestamp: new Date(),
    });

    return sendSuccess(res, { tracked: true });
  } catch (error: any) {
    console.error('[trackOutletMenuView] FATAL ERROR:', error);
    console.error(error.stack);
    return sendError(res, `Menu view tracking failed: ${error.message}`);
  }
};

export const getOutletAnalytics = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date_from, date_to } = req.query;

    const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const startOfNextUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
    const utcDateKey = (d: Date) => d.toISOString().slice(0, 10);

    const outlet = await outletService.getOutletById(id);
    if (!outlet) return sendError(res, 'Outlet not found', 404);

    const fallbackFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fallbackTo = new Date();
    const rawFrom = date_from ? new Date(date_from as string) : fallbackFrom;
    const rawTo = date_to ? new Date(date_to as string) : fallbackTo;
    const dateFrom = isNaN(rawFrom.getTime()) ? fallbackFrom : rawFrom;
    const dateTo = isNaN(rawTo.getTime()) ? fallbackTo : rawTo;

    const rangeStart = startOfUtcDay(dateFrom);
    const rangeEndExclusive = startOfNextUtcDay(dateTo);

    const summaries = await OutletAnalyticsSummary.find({
      outlet_id: outlet._id,
      date: { $gte: rangeStart, $lt: rangeEndExclusive },
    }).sort({ date: 1 });

    const dailyByKey = new Map<
      string,
      {
        dateKey: string;
        outlet_visits: number;
        profile_views: number;
        menu_views: number;
        unique_sessions: number;
        view_to_menu_rate: number;
        device_breakdown: { mobile: number; desktop: number; tablet: number };
        hourly_breakdown: Array<{ hour: number; profile_views: number; menu_views: number }>;
      }
    >();

    for (const s of summaries) {
      const key = utcDateKey(s.date);
      dailyByKey.set(key, {
        dateKey: key,
        outlet_visits: (s.metrics as any).outlet_visits || 0,
        profile_views: s.metrics.profile_views,
        menu_views: s.metrics.menu_views,
        unique_sessions: s.metrics.unique_sessions,
        view_to_menu_rate: s.metrics.view_to_menu_rate,
        device_breakdown: s.device_breakdown,
        hourly_breakdown: s.hourly_breakdown,
      });
    }

    const now = new Date();
    const todayStartUtc = startOfUtcDay(now);
    const yesterdayStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));

    const outletObjectId = outlet._id;
    console.log(`[getOutletAnalytics] Aggregate with ID: ${outletObjectId}`);
    const recentDayStarts = [yesterdayStartUtc, todayStartUtc];

    for (const dayStart of recentDayStarts) {
      if (dayStart.getTime() < rangeStart.getTime() || dayStart.getTime() >= rangeEndExclusive.getTime()) {
        continue;
      }

      const dayKey = utcDateKey(dayStart);
      const hasSummary = dailyByKey.has(dayKey);

      // Always merge today, and backfill yesterday if summary missing.
      if (dayStart.getTime() === todayStartUtc.getTime() || !hasSummary) {
        const dayEnd = startOfNextUtcDay(dayStart);

        const liveGroups = await OutletAnalyticsEvent.aggregate([
          {
            $match: {
              outlet_id: outletObjectId,
              timestamp: { $gte: dayStart, $lt: dayEnd },
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

        if (liveGroups.length > 0) {
          const outlet_visits = liveGroups
            .filter((e: any) => e._id.event_type === 'outlet_visit')
            .reduce((sum: number, e: any) => sum + e.count, 0);

          const profile_views = liveGroups
            .filter((e: any) => e._id.event_type === 'profile_view')
            .reduce((sum: number, e: any) => sum + e.count, 0);

          const menu_views = liveGroups
            .filter((e: any) => e._id.event_type === 'menu_view')
            .reduce((sum: number, e: any) => sum + e.count, 0);

          const allUniqueSessions = new Set(liveGroups.flatMap((e: any) => e.unique_sessions));

          const device_breakdown = {
            mobile: liveGroups.filter((e: any) => e._id.device_type === 'mobile').reduce((s: number, e: any) => s + e.count, 0),
            desktop: liveGroups.filter((e: any) => e._id.device_type === 'desktop').reduce((s: number, e: any) => s + e.count, 0),
            tablet: liveGroups.filter((e: any) => e._id.device_type === 'tablet').reduce((s: number, e: any) => s + e.count, 0),
          };

          const hourly_breakdown = Array.from({ length: 24 }, (_, hour) => {
            const hourEvents = liveGroups.filter((e: any) => e._id.hour === hour);
            return {
              hour,
              profile_views: hourEvents
                .filter((e: any) => e._id.event_type === 'profile_view')
                .reduce((sum: number, e: any) => sum + e.count, 0),
              menu_views: hourEvents
                .filter((e: any) => e._id.event_type === 'menu_view')
                .reduce((sum: number, e: any) => sum + e.count, 0),
            };
          });

          const view_to_menu_rate = profile_views > 0 ? (menu_views / profile_views) * 100 : 0;

          const existing = dailyByKey.get(dayKey);
          if (existing) {
            dailyByKey.set(dayKey, {
              ...existing,
              outlet_visits: Math.max(existing.outlet_visits, outlet_visits),
              profile_views: Math.max(existing.profile_views, profile_views),
              menu_views: Math.max(existing.menu_views, menu_views),
              unique_sessions: Math.max(existing.unique_sessions, allUniqueSessions.size),
              view_to_menu_rate: Math.max(existing.view_to_menu_rate, parseFloat(view_to_menu_rate.toFixed(2))),
              // Prefer summary breakdowns if they exist; otherwise take live.
              device_breakdown: existing.device_breakdown || device_breakdown,
              hourly_breakdown: existing.hourly_breakdown?.length ? existing.hourly_breakdown : hourly_breakdown,
            });
          } else {
            dailyByKey.set(dayKey, {
              dateKey: dayKey,
              outlet_visits,
              profile_views,
              menu_views,
              unique_sessions: allUniqueSessions.size,
              view_to_menu_rate: parseFloat(view_to_menu_rate.toFixed(2)),
              device_breakdown,
              hourly_breakdown,
            });
          }
        }
      }
    }

    const daily_breakdown = Array.from(dailyByKey.values())
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map((d) => ({
        date: d.dateKey,
        outlet_visits: d.outlet_visits,
        profile_views: d.profile_views,
        menu_views: d.menu_views,
        unique_sessions: d.unique_sessions,
        view_to_menu_rate: d.view_to_menu_rate,
      }));

    // Fill missing days as zeros for chart continuity
    for (let dt = new Date(rangeStart); dt.getTime() < rangeEndExclusive.getTime(); dt = startOfNextUtcDay(dt)) {
      const key = utcDateKey(dt);
      if (!dailyByKey.has(key)) {
        dailyByKey.set(key, {
          dateKey: key,
          outlet_visits: 0,
          profile_views: 0,
          menu_views: 0,
          unique_sessions: 0,
          view_to_menu_rate: 0,
          device_breakdown: { mobile: 0, desktop: 0, tablet: 0 },
          hourly_breakdown: Array.from({ length: 24 }, (_, hour) => ({ hour, profile_views: 0, menu_views: 0 })),
        });
      }
    }

    const dailySorted = Array.from(dailyByKey.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    const summary = dailySorted.reduce(
      (acc, d) => {
        acc.outlet_visits += d.outlet_visits;
        acc.profile_views += d.profile_views;
        acc.menu_views += d.menu_views;
        acc.unique_sessions += d.unique_sessions;
        return acc;
      },
      { outlet_visits: 0, profile_views: 0, menu_views: 0, unique_sessions: 0 }
    );

    const view_to_menu_rate = summary.profile_views > 0 ? (summary.menu_views / summary.profile_views) * 100 : 0;

    const deviceTotals = { mobile: 0, desktop: 0, tablet: 0 };
    const hourlyTotals = Array.from({ length: 24 }, (_, hour) => ({ hour, profile_views: 0, menu_views: 0 }));

    for (const day of dailySorted) {
      deviceTotals.mobile += day.device_breakdown.mobile;
      deviceTotals.desktop += day.device_breakdown.desktop;
      deviceTotals.tablet += day.device_breakdown.tablet;

      day.hourly_breakdown.forEach((h) => {
        hourlyTotals[h.hour].profile_views += h.profile_views;
        hourlyTotals[h.hour].menu_views += h.menu_views;
      });
    }

    return sendSuccess(res, {
      outlet: {
        _id: outlet._id,
        name: (outlet as any).name,
        logo_url: (outlet as any).logo_url,
      },
      summary: {
        ...summary,
        view_to_menu_rate: parseFloat(view_to_menu_rate.toFixed(2)),
      },
      daily_breakdown: dailySorted.map((d) => ({
        date: d.dateKey,
        outlet_visits: d.outlet_visits,
        profile_views: d.profile_views,
        menu_views: d.menu_views,
        unique_sessions: d.unique_sessions,
        view_to_menu_rate: d.view_to_menu_rate,
      })),
      device_breakdown: deviceTotals,
      hourly_pattern: hourlyTotals,
    });
  } catch (error: any) {
    console.error('Get outlet analytics error:', error);
    return sendError(res, error.message || 'Failed to fetch outlet analytics');
  }
};
