import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { Outlet } from '../models/Outlet.js';
import { OutletAnalyticsEvent } from '../models/OutletAnalyticsEvent.js';
import { Subscription, ISubscription } from '../models/Subscription.js';
import { ensureSubscriptionForOutlet } from '../utils/subscriptionUtils.js';
import { sendError, sendSuccess } from '../utils/response.js';
import { normalizePlanToTier } from '../config/subscriptionPlans.js';

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfNextUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));

const shiftDays = (d: Date, days: number) => new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

const clampRange = (range?: string): 'today' | 'yesterday' | 'week' | 'month' | 'custom' => {
  if (range === 'yesterday' || range === 'week' || range === 'month' || range === 'custom') return range;
  return 'today';
};

const clampDays = (raw?: string): number | null => {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  if (n < 2) return 2;
  if (n > 90) return 90;
  return n;
};

const getPeriod = (range: 'today' | 'yesterday' | 'week' | 'month' | 'custom', customDays?: number | null) => {
  const now = new Date();

  if (range === 'today') {
    const endExclusive = startOfNextUtcDay(now);
    const start = startOfUtcDay(now);
    return { start, endExclusive, days: 1 };
  }

  if (range === 'yesterday') {
    const endExclusive = startOfUtcDay(now);
    const start = startOfUtcDay(shiftDays(now, -1));
    return { start, endExclusive, days: 1 };
  }

  if (range === 'custom') {
    const days = customDays && customDays > 1 ? customDays : 7;
    const endExclusive = startOfNextUtcDay(now);
    const start = startOfUtcDay(shiftDays(now, -(days - 1)));
    return { start, endExclusive, days };
  }

  const endExclusive = startOfNextUtcDay(now);
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

const formatUtcDayKey = (d: Date) => {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const getOutletDashboardAnalytics = async (req: Request, res: Response) => {
  try {
    const { outletId } = req.params;
    const range = clampRange((req.query.range as string) || undefined);
    const daysParam = clampDays((req.query.days as string) || undefined);

    const outlet = await Outlet.findById(outletId).select('name subscription_id');
    if (!outlet) return sendError(res, 'Outlet not found', 404);

    // Subscription gate: analytics requires Premium plan.
    const outletObjectId = new mongoose.Types.ObjectId(outletId);
    // Always resolve the latest subscription by outlet_id.
    // This avoids false "locked" states when Outlet.subscription_id is stale (or if legacy data has duplicates).
    let subscription: ISubscription | null = await Subscription.findOne({ outlet_id: outletObjectId }).sort({
      updated_at: -1,
      created_at: -1,
    });

    if (!subscription) {
      subscription = await ensureSubscriptionForOutlet(outletId, {
        plan: 'free',
        status: 'active',
        assigned_by: (req as any).user?.id,
        notes: 'Auto-created on dashboard analytics access'
      });
    }

    if (!outlet.subscription_id || outlet.subscription_id.toString() !== subscription._id.toString()) {
      outlet.subscription_id = subscription._id;
      await outlet.save();
    }

    const allowedStatuses = new Set(['active', 'trial']);
    const tier = normalizePlanToTier(subscription.plan);
    const isAllowed = tier === 'premium' && allowedStatuses.has(subscription.status);
    if (!isAllowed) {
      return sendError(
        res,
        'Subscription required',
        { required_plan: 'premium', current_plan: tier, current_status: subscription.status },
        403
      );
    }

    const { start, endExclusive, days } = getPeriod(range, daysParam);
    const prevStart = shiftDays(start, -days);
    const prevEndExclusive = start;

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

    // Daily series for simple charts (UTC days)
    const dailyAgg = await OutletAnalyticsEvent.aggregate([
      {
        $match: {
          outlet_id: outletObjectId,
          timestamp: { $gte: start, $lt: endExclusive },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$timestamp',
              timezone: 'UTC',
            },
          },
          outlet_visits: {
            $sum: {
              $cond: [{ $eq: ['$event_type', 'outlet_visit'] }, 1, 0],
            },
          },
          profile_views: {
            $sum: {
              $cond: [{ $eq: ['$event_type', 'profile_view'] }, 1, 0],
            },
          },
          menu_views: {
            $sum: {
              $cond: [{ $eq: ['$event_type', 'menu_view'] }, 1, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dailyMap = new Map<string, { outlet_visits: number; profile_views: number; menu_views: number }>();
    for (const row of dailyAgg as any[]) {
      dailyMap.set(String(row._id), {
        outlet_visits: Number(row.outlet_visits) || 0,
        profile_views: Number(row.profile_views) || 0,
        menu_views: Number(row.menu_views) || 0,
      });
    }

    const series = Array.from({ length: days }, (_, i) => {
      const day = shiftDays(start, i);
      const key = formatUtcDayKey(day);
      const v = dailyMap.get(key) || { outlet_visits: 0, profile_views: 0, menu_views: 0 };
      return { date: key, ...v };
    });

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
        days,
      },
      series,
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
