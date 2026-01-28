import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { FoodItem } from '../models/FoodItem.js';
import { Outlet } from '../models/Outlet.js';
import {
  FoodItemAnalyticsEvent,
  FoodItemAnalyticsEventType,
  FoodItemAnalyticsSource,
} from '../models/FoodItemAnalyticsEvent.js';
import { FoodItemAnalyticsSummary } from '../models/FoodItemAnalyticsSummary.js';
import { sendError, sendSuccess } from '../utils/response.js';

// Constants
const ANALYTICS_LIMITS = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 200,
  MIN_LIMIT: 1,
  DEFAULT_DATE_RANGE_DAYS: 30,
  DEDUPE_MINUTES_IMPRESSION: 10,
} as const;

const ALLOWED_SOURCES: FoodItemAnalyticsSource[] = [
  'menu',
  'explore',
  'home',
  'search',
  'shared',
  'promo',
  'notification',
  'other',
];

const SORT_OPTIONS = ['impressions', 'views', 'add_to_cart', 'orders', 'view_to_cart', 'cart_to_order'] as const;

// Helper Functions
const detectDeviceType = (userAgentRaw: string): 'mobile' | 'desktop' | 'tablet' => {
  const userAgent = userAgentRaw || '';
  if (/mobile/i.test(userAgent) && !/tablet|ipad/i.test(userAgent)) return 'mobile';
  if (/tablet|ipad/i.test(userAgent)) return 'tablet';
  return 'desktop';
};

const getIpAddress = (req: Request) =>
  (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress;

const isValidObjectId = (value: unknown): value is string =>
  typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);

const normalizeLimit = (limit: unknown): number => {
  const parsed = Math.max(parseInt(String(limit || ANALYTICS_LIMITS.DEFAULT_LIMIT), 10) || ANALYTICS_LIMITS.DEFAULT_LIMIT, ANALYTICS_LIMITS.MIN_LIMIT);
  return Math.min(parsed, ANALYTICS_LIMITS.MAX_LIMIT);
};

const resolveSource = (source: unknown): FoodItemAnalyticsSource => {
  return ALLOWED_SOURCES.includes(source as any) ? (source as FoodItemAnalyticsSource) : 'other';
};

// Date Utilities
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfNextUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
const utcDateKey = (d: Date) => d.toISOString().slice(0, 10);

const parseDateRange = (date_from?: unknown, date_to?: unknown) => {
  const fallbackFrom = new Date(Date.now() - ANALYTICS_LIMITS.DEFAULT_DATE_RANGE_DAYS * 24 * 60 * 60 * 1000);
  const fallbackTo = new Date();
  const rawFrom = typeof date_from === 'string' ? new Date(date_from) : fallbackFrom;
  const rawTo = typeof date_to === 'string' ? new Date(date_to) : fallbackTo;
  const dateFrom = isNaN(rawFrom.getTime()) ? fallbackFrom : rawFrom;
  const dateTo = isNaN(rawTo.getTime()) ? fallbackTo : rawTo;
  const rangeStart = startOfUtcDay(dateFrom);
  const rangeEndExclusive = startOfNextUtcDay(dateTo);
  return { rangeStart, rangeEndExclusive };
};

type TrackFoodItemBody = {
  outlet_id?: string;
  food_item_id?: string;
  session_id?: string;
  source?: FoodItemAnalyticsSource | string;
  source_context?: Record<string, any>;
};

async function trackFoodItemEvent(
  req: Request,
  res: Response,
  event_type: FoodItemAnalyticsEventType,
  options?: { dedupeMinutes?: number }
) {
  try {
    const { outlet_id, food_item_id, session_id, source, source_context } = req.body as TrackFoodItemBody;

    if (!isValidObjectId(outlet_id)) return sendError(res, 'Invalid outlet_id', null, 400);
    if (!isValidObjectId(food_item_id)) return sendError(res, 'Invalid food_item_id', null, 400);

    const resolvedSource = resolveSource(source);
    const sid = session_id || 'anonymous';

    // Validate item belongs to outlet and fetch category_id (no brand_id stored).
    const foodItem = await FoodItem.findById(food_item_id).select('_id outlet_id category_id');
    if (!foodItem) return sendError(res, 'Food item not found', null, 404);
    if (String(foodItem.outlet_id) !== String(outlet_id)) {
      return sendError(res, 'Food item does not belong to outlet', null, 400);
    }

    // Optional dedupe (useful for impressions).
    if (options?.dedupeMinutes && options.dedupeMinutes > 0) {
      const since = new Date(Date.now() - options.dedupeMinutes * 60 * 1000);
      const recent = await FoodItemAnalyticsEvent.findOne({
        outlet_id: new mongoose.Types.ObjectId(outlet_id),
        food_item_id: new mongoose.Types.ObjectId(food_item_id),
        session_id: sid,
        event_type,
        timestamp: { $gte: since },
      }).select('_id');

      if (recent) return sendSuccess(res, { tracked: false, deduped: true });
    }

    const userAgent = (req.headers['user-agent'] as string) || '';
    const device_type = detectDeviceType(userAgent);
    const ip_address = getIpAddress(req);

    await FoodItemAnalyticsEvent.create({
      outlet_id: new mongoose.Types.ObjectId(outlet_id),
      food_item_id: new mongoose.Types.ObjectId(food_item_id),
      category_id: (foodItem as any).category_id,
      event_type,
      session_id: sid,
      device_type,
      user_agent: userAgent,
      ip_address,
      source: resolvedSource,
      source_context,
      timestamp: new Date(),
    });

    return sendSuccess(res, { tracked: true });
  } catch (error: any) {
    console.error('Track food item analytics error:', error);
    return sendError(res, error?.message || 'Failed to track food item analytics');
  }
}

export const trackFoodItemImpression = async (req: Request, res: Response) =>
  trackFoodItemEvent(req, res, 'item_impression', { dedupeMinutes: ANALYTICS_LIMITS.DEDUPE_MINUTES_IMPRESSION });

export const trackFoodItemView = async (req: Request, res: Response) =>
  trackFoodItemEvent(req, res, 'item_view');

export const trackFoodItemAddToCart = async (req: Request, res: Response) =>
  trackFoodItemEvent(req, res, 'add_to_cart');

export const trackFoodItemOrderCreated = async (req: Request, res: Response) =>
  trackFoodItemEvent(req, res, 'order_created');

type SortBy = typeof SORT_OPTIONS[number];

const toSortBy = (value: unknown): SortBy => {
  const v = typeof value === 'string' ? value : '';
  return SORT_OPTIONS.includes(v as any) ? (v as SortBy) : 'views';
};

const calculateConversionRates = (views: number, add_to_cart: number, orders: number) => {
  const view_to_cart_rate = views > 0 ? (add_to_cart / views) * 100 : 0;
  const cart_to_order_rate = add_to_cart > 0 ? (orders / add_to_cart) * 100 : 0;
  return {
    view_to_cart_rate: parseFloat(view_to_cart_rate.toFixed(2)),
    cart_to_order_rate: parseFloat(cart_to_order_rate.toFixed(2)),
  };
};

const mapAnalyticsItem = (item: any) => {
  const rates = calculateConversionRates(item.metrics.views, item.metrics.add_to_cart, item.metrics.orders);
  return {
    ...item,
    metrics: {
      ...item.metrics,
      ...rates,
    },
  };
};

const createMetricsBucket = (category_id?: mongoose.Types.ObjectId) => ({
  impressions: 0,
  views: 0,
  add_to_cart: 0,
  orders: 0,
  unique_sessions: 0,
  ...(category_id && { category_id }),
});

const sortItems = (items: any[], sortBy: SortBy) => {
  const score = (i: any) => {
    const m = i.metrics || {};
    if (sortBy === 'view_to_cart') return m.view_to_cart_rate || 0;
    if (sortBy === 'cart_to_order') return m.cart_to_order_rate || 0;
    return m[sortBy] || 0;
  };
  return items.sort((a, b) => score(b) - score(a));
};

async function aggregateFromEvents(match: Record<string, any>) {
  const groups = await FoodItemAnalyticsEvent.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          food_item_id: '$food_item_id',
          category_id: '$category_id',
          event_type: '$event_type',
        },
        count: { $sum: 1 },
        unique_sessions: { $addToSet: '$session_id' },
      },
    },
  ]);

  const byItem = new Map<
    string,
    {
      food_item_id: mongoose.Types.ObjectId;
      category_id?: mongoose.Types.ObjectId;
      impressions: number;
      views: number;
      add_to_cart: number;
      orders: number;
      unique_sessions: Set<string>;
    }
  >();

  for (const g of groups as any[]) {
    const foodItemId = g._id.food_item_id as mongoose.Types.ObjectId;
    const key = String(foodItemId);
    const bucket =
      byItem.get(key) ||
      {
        food_item_id: foodItemId,
        category_id: g._id.category_id as mongoose.Types.ObjectId | undefined,
        impressions: 0,
        views: 0,
        add_to_cart: 0,
        orders: 0,
        unique_sessions: new Set<string>(),
      };

    const et = g._id.event_type as string;
    if (et === 'item_impression') bucket.impressions += g.count;
    if (et === 'item_view') bucket.views += g.count;
    if (et === 'add_to_cart') bucket.add_to_cart += g.count;
    if (et === 'order_created') bucket.orders += g.count;

    for (const sid of g.unique_sessions || []) bucket.unique_sessions.add(String(sid));

    byItem.set(key, bucket);
  }

  return Array.from(byItem.values()).map((b) => {
    const rates = calculateConversionRates(b.views, b.add_to_cart, b.orders);
    return {
      food_item_id: b.food_item_id,
      category_id: b.category_id,
      metrics: {
        impressions: b.impressions,
        views: b.views,
        add_to_cart: b.add_to_cart,
        orders: b.orders,
        unique_sessions: b.unique_sessions.size,
        ...rates,
      },
    };
  });
}

export const getFoodItemAnalyticsByOutlet = async (req: Request, res: Response) => {
  try {
    const { outletId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(outletId)) return sendError(res, 'Invalid outletId', null, 400);

    const { date_from, date_to, source, sortBy, limit } = req.query;
    const { rangeStart, rangeEndExclusive } = parseDateRange(date_from, date_to);
    const lim = Math.min(Math.max(parseInt(String(limit || '20'), 10) || 20, 1), 200);
    const sort = toSortBy(sortBy);

    // If filtering by source, use raw events (summary can't filter by source efficiently).
    if (typeof source === 'string' && source.length) {
      const items = await aggregateFromEvents({
        outlet_id: new mongoose.Types.ObjectId(outletId),
        source,
        timestamp: { $gte: rangeStart, $lt: rangeEndExclusive },
      });
      return sendSuccess(res, { outlet_id: outletId, items: sortItems(items, sort).slice(0, lim) });
    }

    const todayStartUtc = startOfUtcDay(new Date());
    const historyEnd = rangeEndExclusive.getTime() > todayStartUtc.getTime() ? todayStartUtc : rangeEndExclusive;

    const summaries = await FoodItemAnalyticsSummary.find({
      outlet_id: outletId,
      date: { $gte: rangeStart, $lt: historyEnd },
    }).select('food_item_id category_id metrics');

    const byItem = new Map<string, any>();

    for (const s of summaries as any[]) {
      const key = String(s.food_item_id);
      const existing = byItem.get(key) || {
        food_item_id: s.food_item_id,
        category_id: s.category_id,
        metrics: createMetricsBucket(),
      };

      existing.metrics.impressions += s.metrics.impressions || 0;
      existing.metrics.views += s.metrics.views || 0;
      existing.metrics.add_to_cart += s.metrics.add_to_cart || 0;
      existing.metrics.orders += s.metrics.orders || 0;
      existing.metrics.unique_sessions += s.metrics.unique_sessions || 0;

      byItem.set(key, existing);
    }

    // If range includes today, merge live events for today.
    if (rangeEndExclusive.getTime() > todayStartUtc.getTime()) {
      const live = await aggregateFromEvents({
        outlet_id: new mongoose.Types.ObjectId(outletId),
        timestamp: { $gte: todayStartUtc, $lt: rangeEndExclusive },
      });

      for (const li of live) {
        const key = String(li.food_item_id);
        const existing = byItem.get(key) || {
          food_item_id: li.food_item_id,
          category_id: li.category_id,
          metrics: { impressions: 0, views: 0, add_to_cart: 0, orders: 0, unique_sessions: 0 },
        };
        existing.metrics.impressions += li.metrics.impressions;
        existing.metrics.views += li.metrics.views;
        existing.metrics.add_to_cart += li.metrics.add_to_cart;
        existing.metrics.orders += li.metrics.orders;
        existing.metrics.unique_sessions += li.metrics.unique_sessions;
        byItem.set(key, existing);
      }
    }

    const items = Array.from(byItem.values()).map((i) => {
      const view_to_cart_rate = i.metrics.views > 0 ? (i.metrics.add_to_cart / i.metrics.views) * 100 : 0;
      const cart_to_order_rate = i.metrics.add_to_cart > 0 ? (i.metrics.orders / i.metrics.add_to_cart) * 100 : 0;
      return {
        ...i,
        metrics: {
          ...i.metrics,
          view_to_cart_rate: parseFloat(view_to_cart_rate.toFixed(2)),
          cart_to_order_rate: parseFloat(cart_to_order_rate.toFixed(2)),
        },
      };
    });

    return sendSuccess(res, { outlet_id: outletId, items: sortItems(items, sort).slice(0, lim) });
  } catch (error: any) {
    console.error('Get food item analytics by outlet error:', error);
    return sendError(res, error?.message || 'Failed to get food item analytics');
  }
};

export const getFoodItemAnalyticsByBrand = async (req: Request, res: Response) => {
  try {
    const { brandId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(brandId)) return sendError(res, 'Invalid brandId', null, 400);

    const outlets = await Outlet.find({ brand_id: brandId }).select('_id');
    const outletIds = outlets.map((o) => o._id);
    if (outletIds.length === 0) return sendSuccess(res, { brand_id: brandId, items: [] });

    const { date_from, date_to, source, sortBy, limit } = req.query;
    const { rangeStart, rangeEndExclusive } = parseDateRange(date_from, date_to);
    const lim = normalizeLimit(limit);
    const sort = toSortBy(sortBy);

    // Source filter => raw events.
    if (typeof source === 'string' && source.length) {
      const items = await aggregateFromEvents({
        outlet_id: { $in: outletIds },
        source,
        timestamp: { $gte: rangeStart, $lt: rangeEndExclusive },
      });
      return sendSuccess(res, { brand_id: brandId, outlet_ids: outletIds, items: sortItems(items, sort).slice(0, lim) });
    }

    const todayStartUtc = startOfUtcDay(new Date());
    const historyEnd = rangeEndExclusive.getTime() > todayStartUtc.getTime() ? todayStartUtc : rangeEndExclusive;

    const summaries = await FoodItemAnalyticsSummary.find({
      outlet_id: { $in: outletIds },
      date: { $gte: rangeStart, $lt: historyEnd },
    }).select('food_item_id category_id metrics');

    const byItem = new Map<string, any>();
    for (const s of summaries as any[]) {
      const key = String(s.food_item_id);
      const existing = byItem.get(key) || {
        food_item_id: s.food_item_id,
        category_id: s.category_id,
        metrics: createMetricsBucket(),
      };
      existing.metrics.impressions += s.metrics.impressions || 0;
      existing.metrics.views += s.metrics.views || 0;
      existing.metrics.add_to_cart += s.metrics.add_to_cart || 0;
      existing.metrics.orders += s.metrics.orders || 0;
      existing.metrics.unique_sessions += s.metrics.unique_sessions || 0;
      byItem.set(key, existing);
    }

    if (rangeEndExclusive.getTime() > todayStartUtc.getTime()) {
      const live = await aggregateFromEvents({
        outlet_id: { $in: outletIds },
        timestamp: { $gte: todayStartUtc, $lt: rangeEndExclusive },
      });
      for (const li of live) {
        const key = String(li.food_item_id);
        const existing = byItem.get(key) || {
          food_item_id: li.food_item_id,
          category_id: li.category_id,
          metrics: createMetricsBucket(),
        };
        existing.metrics.impressions += li.metrics.impressions;
        existing.metrics.views += li.metrics.views;
        existing.metrics.add_to_cart += li.metrics.add_to_cart;
        existing.metrics.orders += li.metrics.orders;
        existing.metrics.unique_sessions += li.metrics.unique_sessions;
        byItem.set(key, existing);
      }
    }

    const items = Array.from(byItem.values()).map(mapAnalyticsItem);

    return sendSuccess(res, {
      brand_id: brandId,
      outlet_ids: outletIds,
      items: sortItems(items, sort).slice(0, lim),
    });
  } catch (error: any) {
    console.error('Get food item analytics by brand error:', error);
    return sendError(res, error?.message || 'Failed to get brand food item analytics');
  }
};

export const getFoodItemAnalyticsByCategory = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(categoryId)) return sendError(res, 'Invalid categoryId', null, 400);

    const { outlet_id, date_from, date_to, source, sortBy, limit } = req.query;
    const { rangeStart, rangeEndExclusive } = parseDateRange(date_from, date_to);
    const lim = normalizeLimit(limit);
    const sort = toSortBy(sortBy);

    const matchBase: any = {
      category_id: new mongoose.Types.ObjectId(categoryId),
      timestamp: { $gte: rangeStart, $lt: rangeEndExclusive },
    };

    if (typeof outlet_id === 'string' && mongoose.Types.ObjectId.isValid(outlet_id)) {
      matchBase.outlet_id = new mongoose.Types.ObjectId(outlet_id);
    }

    if (typeof source === 'string' && source.length) matchBase.source = source;

    const items = await aggregateFromEvents(matchBase);
    return sendSuccess(res, { category_id: categoryId, items: sortItems(items, sort).slice(0, lim) });
  } catch (error: any) {
    console.error('Get food item analytics by category error:', error);
    return sendError(res, error?.message || 'Failed to get category food item analytics');
  }
};

export const getFoodItemAnalyticsByItem = async (req: Request, res: Response) => {
  try {
    const { foodItemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(foodItemId)) return sendError(res, 'Invalid foodItemId', null, 400);

    const { date_from, date_to, source } = req.query;
    const { rangeStart, rangeEndExclusive } = parseDateRange(date_from, date_to);

    // If filtering by source, use raw events for the whole range.
    if (typeof source === 'string' && source.length) {
      const groups = await FoodItemAnalyticsEvent.aggregate([
        {
          $match: {
            food_item_id: new mongoose.Types.ObjectId(foodItemId),
            source,
            timestamp: { $gte: rangeStart, $lt: rangeEndExclusive },
          },
        },
        {
          $group: {
            _id: {
              dateKey: {
                $dateToString: {
                  date: '$timestamp',
                  format: '%Y-%m-%d',
                  timezone: 'UTC',
                },
              },
              event_type: '$event_type',
            },
            count: { $sum: 1 },
          },
        },
      ]);

      const byDate = new Map<string, any>();
      for (const g of groups as any[]) {
        const key = g._id.dateKey as string;
        const row = byDate.get(key) || { date: key, impressions: 0, views: 0, add_to_cart: 0, orders: 0 };
        if (g._id.event_type === 'item_impression') row.impressions += g.count;
        if (g._id.event_type === 'item_view') row.views += g.count;
        if (g._id.event_type === 'add_to_cart') row.add_to_cart += g.count;
        if (g._id.event_type === 'order_created') row.orders += g.count;
        byDate.set(key, row);
      }

      const daily = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
      return sendSuccess(res, { food_item_id: foodItemId, source, daily });
    }

    const todayStartUtc = startOfUtcDay(new Date());
    const historyEnd = rangeEndExclusive.getTime() > todayStartUtc.getTime() ? todayStartUtc : rangeEndExclusive;

    const summaries = await FoodItemAnalyticsSummary.find({
      food_item_id: foodItemId,
      date: { $gte: rangeStart, $lt: historyEnd },
    }).select('date metrics');

    const byKey = new Map<string, any>();
    for (const s of summaries as any[]) {
      const key = utcDateKey(s.date);
      byKey.set(key, {
        date: key,
        impressions: s.metrics.impressions || 0,
        views: s.metrics.views || 0,
        add_to_cart: s.metrics.add_to_cart || 0,
        orders: s.metrics.orders || 0,
      });
    }

    // Merge today live if needed.
    if (rangeEndExclusive.getTime() > todayStartUtc.getTime()) {
      const todayKey = utcDateKey(todayStartUtc);
      const live = await aggregateFromEvents({
        food_item_id: new mongoose.Types.ObjectId(foodItemId),
        timestamp: { $gte: todayStartUtc, $lt: rangeEndExclusive },
      });
      const one = live[0];
      if (one) {
        byKey.set(todayKey, {
          date: todayKey,
          impressions: one.metrics.impressions,
          views: one.metrics.views,
          add_to_cart: one.metrics.add_to_cart,
          orders: one.metrics.orders,
        });
      }
    }

    // Fill missing days with zeros.
    for (let dt = new Date(rangeStart); dt.getTime() < rangeEndExclusive.getTime(); dt = startOfNextUtcDay(dt)) {
      const key = utcDateKey(dt);
      if (!byKey.has(key)) {
        byKey.set(key, { date: key, impressions: 0, views: 0, add_to_cart: 0, orders: 0 });
      }
    }

    const daily = Array.from(byKey.values()).sort((a, b) => a.date.localeCompare(b.date));
    return sendSuccess(res, { food_item_id: foodItemId, daily });
  } catch (error: any) {
    console.error('Get food item analytics by item error:', error);
    return sendError(res, error?.message || 'Failed to get food item analytics for item');
  }
};
