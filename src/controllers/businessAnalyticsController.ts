import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { Outlet } from '../models/Outlet.js';
import { OutletAnalyticsEvent } from '../models/OutletAnalyticsEvent.js';
import { sendError, sendSuccess } from '../utils/response.js';

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfNextUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));

const shiftDays = (d: Date, days: number) => new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

const clampRange = (range?: string): 'today' | 'week' | 'month' => {
  if (range === 'week' || range === 'month') return range;
  return 'today';
};

const getPeriod = (range: 'today' | 'week' | 'month') => {
  const now = new Date();
  const endExclusive = startOfNextUtcDay(now);

  if (range === 'today') {
    const start = startOfUtcDay(now);
    return { start, endExclusive, days: 1 };
  }

  const days = range === 'week' ? 7 : 30;
  const start = startOfUtcDay(shiftDays(now, -(days - 1)));
  return { start, endExclusive, days };
};

const pctChange = (current: number, previous: number) => {
  if (previous <= 0) {
    if (current <= 0) return { pct: 0, isUp: false };
    return { pct: 100, isUp: true };
  }
  const pct = ((current - previous) / previous) * 100;
  return { pct: Math.abs(pct), isUp: pct >= 0 };
};

export const getOutletDashboardAnalytics = async (req: Request, res: Response) => {
  try {
    const { outletId } = req.params;
    const range = clampRange((req.query.range as string) || undefined);

    const outlet = await Outlet.findById(outletId).select('name');
    if (!outlet) return sendError(res, 'Outlet not found', 404);

    const { start, endExclusive, days } = getPeriod(range);
    const prevStart = shiftDays(start, -days);
    const prevEndExclusive = start;

    const outletObjectId = new mongoose.Types.ObjectId(outletId);

    const getCounts = async (startDate: Date, endDate: Date) => {
      const groups = await OutletAnalyticsEvent.aggregate([
        {
          $match: {
            outlet_id: outletObjectId,
            timestamp: { $gte: startDate, $lt: endDate },
          },
        },
        {
          $group: {
            _id: '$event_type',
            count: { $sum: 1 },
          },
        },
      ]);

      const get = (t: string) => groups.find((g: any) => g._id === t)?.count || 0;
      return {
        outlet_visits: get('outlet_visit'),
        profile_views: get('profile_view'),
        menu_views: get('menu_view'),
      };
    };

    const [currentCounts, prevCounts] = await Promise.all([
      getCounts(start, endExclusive),
      getCounts(prevStart, prevEndExclusive),
    ]);

    // Build session-level funnel and audience breakdown from raw events.
    const sessions = await OutletAnalyticsEvent.aggregate([
      {
        $match: {
          outlet_id: outletObjectId,
          timestamp: { $gte: start, $lt: endExclusive },
        },
      },
      { $sort: { timestamp: 1 } },
      {
        $group: {
          _id: '$session_id',
          first_device: { $first: '$device_type' },
          first_source: { $first: '$source' },
          first_entry_page: { $first: '$entry_page' },
          has_visit: {
            $max: {
              $cond: [{ $eq: ['$event_type', 'outlet_visit'] }, 1, 0],
            },
          },
          has_profile: {
            $max: {
              $cond: [{ $eq: ['$event_type', 'profile_view'] }, 1, 0],
            },
          },
          has_menu: {
            $max: {
              $cond: [{ $eq: ['$event_type', 'menu_view'] }, 1, 0],
            },
          },
        },
      },
    ]);

    const unique_sessions = sessions.length;

    const funnel = sessions.reduce(
      (acc: { visits: number; profile_sessions: number; menu_sessions: number }, s: any) => {
        acc.visits += s.has_visit ? 1 : 0;
        acc.profile_sessions += s.has_profile ? 1 : 0;
        acc.menu_sessions += s.has_menu ? 1 : 0;
        return acc;
      },
      { visits: 0, profile_sessions: 0, menu_sessions: 0 }
    );

    const funnel_rates = {
      visit_to_profile_rate: funnel.visits > 0 ? parseFloat(((funnel.profile_sessions / funnel.visits) * 100).toFixed(2)) : 0,
      visit_to_menu_rate: funnel.visits > 0 ? parseFloat(((funnel.menu_sessions / funnel.visits) * 100).toFixed(2)) : 0,
      profile_to_menu_rate:
        funnel.profile_sessions > 0 ? parseFloat(((funnel.menu_sessions / funnel.profile_sessions) * 100).toFixed(2)) : 0,
    };

    const device_breakdown = sessions.reduce(
      (acc: Record<string, number>, s: any) => {
        const key = s.first_device || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const source_breakdown = sessions.reduce(
      (acc: Record<string, number>, s: any) => {
        const key = (s.first_source && String(s.first_source).trim()) || 'direct';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const entry_page_breakdown = sessions.reduce(
      (acc: Record<string, number>, s: any) => {
        const key = s.first_entry_page || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // New vs returning (based on whether the session had any event before the current range).
    let new_sessions: number | null = null;
    let returning_sessions: number | null = null;

    const sessionIds = sessions
      .map((s: any) => s._id)
      .filter((sid: any) => typeof sid === 'string' && sid && sid !== 'anonymous');

    if (sessionIds.length > 0 && sessionIds.length <= 2000) {
      const prior = await OutletAnalyticsEvent.distinct('session_id', {
        outlet_id: outletObjectId,
        session_id: { $in: sessionIds },
        timestamp: { $lt: start },
      });
      returning_sessions = prior.length;
      new_sessions = sessionIds.length - prior.length;
    }

    return sendSuccess(res, {
      outlet: { _id: outlet._id, name: outlet.name },
      range: {
        key: range,
        start: start.toISOString(),
        end_exclusive: endExclusive.toISOString(),
      },
      kpis: {
        outlet_visits: currentCounts.outlet_visits,
        profile_views: currentCounts.profile_views,
        menu_views: currentCounts.menu_views,
        unique_sessions,
        trends: {
          outlet_visits: pctChange(currentCounts.outlet_visits, prevCounts.outlet_visits),
          profile_views: pctChange(currentCounts.profile_views, prevCounts.profile_views),
          menu_views: pctChange(currentCounts.menu_views, prevCounts.menu_views),
        },
      },
      funnel: {
        ...funnel,
        ...funnel_rates,
      },
      audience: {
        new_sessions,
        returning_sessions,
        device_breakdown,
        source_breakdown,
        entry_page_breakdown,
      },
    });
  } catch (error: any) {
    console.error('getOutletDashboardAnalytics error:', error);
    return sendError(res, error.message || 'Failed to fetch dashboard analytics');
  }
};
