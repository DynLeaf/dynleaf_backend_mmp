import mongoose from 'mongoose';
import * as analyticsRepo from '../../repositories/analytics/foodItemAnalyticsRepository.js';
import * as foodItemRepo from '../../repositories/foodItemRepository.js';
import * as outletRepo from '../../repositories/outletRepository.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';

import { startOfUtcDay, startOfNextUtcDay } from '../../utils/analyticsUtils.js';
const utcDateKey = (d: Date) => d.toISOString().slice(0, 10);

const calculateConversionRates = (views: number, add_to_cart: number, orders: number) => {
    const view_to_cart_rate = views > 0 ? (add_to_cart / views) * 100 : 0;
    const cart_to_order_rate = add_to_cart > 0 ? (orders / add_to_cart) * 100 : 0;
    return {
        view_to_cart_rate: parseFloat(view_to_cart_rate.toFixed(2)),
        cart_to_order_rate: parseFloat(cart_to_order_rate.toFixed(2)),
    };
};

const createMetricsBucket = () => ({
    impressions: 0,
    views: 0,
    add_to_cart: 0,
    orders: 0,
    unique_sessions: 0,
});

interface AnalyticsMetrics {
    impressions: number;
    views: number;
    add_to_cart: number;
    orders: number;
    unique_sessions: number;
    view_to_cart_rate?: number;
    cart_to_order_rate?: number;
}

interface AnalyticsItem {
    food_item_id: mongoose.Types.ObjectId;
    category_id?: mongoose.Types.ObjectId;
    metrics: AnalyticsMetrics;
}

const mapAnalyticsItem = (item: AnalyticsItem): AnalyticsItem => {
    const rates = calculateConversionRates(item.metrics.views, item.metrics.add_to_cart, item.metrics.orders);
    return {
        ...item,
        metrics: {
            ...item.metrics,
            ...rates,
        },
    };
};

const sortItems = (items: AnalyticsItem[], sortBy: string): AnalyticsItem[] => {
    const score = (i: AnalyticsItem) => {
        const m = i.metrics;
        if (sortBy === 'view_to_cart') return m.view_to_cart_rate || 0;
        if (sortBy === 'cart_to_order') return m.cart_to_order_rate || 0;
        const metrics = (m as unknown) as Record<string, unknown>;
        const val = metrics[sortBy];
        return typeof val === 'number' ? val : 0;
    };
    return items.sort((a, b) => score(b) - score(a));
};

export const trackEvent = async (eventData: Record<string, unknown>, options?: { dedupeMinutes?: number }) => {
    const { outlet_id, food_item_id, event_type, session_id } = eventData as { outlet_id: string; food_item_id: string; event_type: string; session_id: string };

    const foodItem = await foodItemRepo.findById(food_item_id);
    if (!foodItem) throw new AppError('Food item not found', 404);
    if (String(foodItem.outlet_id) !== String(outlet_id)) throw new AppError('Food item does not belong to outlet', 400);

    if (options?.dedupeMinutes && options.dedupeMinutes > 0) {
        const since = new Date(Date.now() - options.dedupeMinutes * 60 * 1000);
        const recent = await analyticsRepo.findRecentEvent({
            outlet_id: new mongoose.Types.ObjectId(outlet_id),
            food_item_id: new mongoose.Types.ObjectId(food_item_id),
            session_id,
            event_type,
            timestamp: { $gte: since },
        });
        if (recent) return { tracked: false, deduped: true };
    }

    await analyticsRepo.createEvent({
        ...eventData,
        category_id: (foodItem as any).category_id, // FoodItem model uses any for category_id in some places or it's a ref.
        timestamp: new Date(),
    });

    return { tracked: true };
};

export const getAnalyticsByOutlet = async (outletId: string, options: { rangeStart: Date; rangeEndExclusive: Date; source?: string; limit?: number; sortBy?: string }) => {
    const { rangeStart, rangeEndExclusive, source, limit = 20, sortBy = 'views' } = options;
    const todayStartUtc = startOfUtcDay(new Date());

    if (source) {
        const items = await aggregateFromEvents({
            outlet_id: new mongoose.Types.ObjectId(outletId),
            source,
            timestamp: { $gte: rangeStart, $lt: rangeEndExclusive },
        });
        return { items: sortItems(items, sortBy).slice(0, limit) };
    }

    const historyEnd = rangeEndExclusive.getTime() > todayStartUtc.getTime() ? todayStartUtc : rangeEndExclusive;
    const summaries = await analyticsRepo.findSummaries({
        outlet_id: outletId,
        date: { $gte: rangeStart, $lt: historyEnd },
    });

    const byItem = new Map<string, AnalyticsItem>();
    for (const s of summaries as any[]) {
        const key = String(s.food_item_id);
        const existing = byItem.get(key) || { food_item_id: s.food_item_id, category_id: s.category_id, metrics: createMetricsBucket() };
        existing.metrics.impressions += s.metrics.impressions || 0;
        existing.metrics.views += s.metrics.views || 0;
        existing.metrics.add_to_cart += s.metrics.add_to_cart || 0;
        existing.metrics.orders += s.metrics.orders || 0;
        existing.metrics.unique_sessions += s.metrics.unique_sessions || 0;
        byItem.set(key, existing);
    }

    if (rangeEndExclusive.getTime() > todayStartUtc.getTime()) {
        const live = await aggregateFromEvents({
            outlet_id: new mongoose.Types.ObjectId(outletId),
            timestamp: { $gte: todayStartUtc, $lt: rangeEndExclusive },
        });
        for (const li of live) {
            const key = String(li.food_item_id);
            const existing = byItem.get(key) || { food_item_id: li.food_item_id, category_id: li.category_id, metrics: createMetricsBucket() };
            existing.metrics.impressions += li.metrics.impressions;
            existing.metrics.views += li.metrics.views;
            existing.metrics.add_to_cart += li.metrics.add_to_cart;
            existing.metrics.orders += li.metrics.orders;
            existing.metrics.unique_sessions += li.metrics.unique_sessions;
            byItem.set(key, existing);
        }
    }

    const items = Array.from(byItem.values()).map(mapAnalyticsItem);
    return { items: sortItems(items, sortBy).slice(0, limit) };
};

export const getAnalyticsByBrand = async (brandId: string, options: { rangeStart: Date; rangeEndExclusive: Date; source?: string; limit?: number; sortBy?: string }) => {
    const { rangeStart, rangeEndExclusive, source, limit = 20, sortBy = 'views' } = options;
    const outletIds = await outletRepo.findOutletIdsByBrand(brandId);
    if (outletIds.length === 0) return { items: [] };

    if (source) {
        const items = await aggregateFromEvents({
            outlet_id: { $in: outletIds },
            source,
            timestamp: { $gte: rangeStart, $lt: rangeEndExclusive },
        });
        return { items: sortItems(items, sortBy).slice(0, limit), outlet_ids: outletIds };
    }

    const todayStartUtc = startOfUtcDay(new Date());
    const historyEnd = rangeEndExclusive.getTime() > todayStartUtc.getTime() ? todayStartUtc : rangeEndExclusive;

    const summaries = await analyticsRepo.findSummaries({
        outlet_id: { $in: outletIds },
        date: { $gte: rangeStart, $lt: historyEnd },
    });

    const byItem = new Map<string, AnalyticsItem>();
    for (const s of summaries as any[]) {
        const key = String(s.food_item_id);
        const existing = byItem.get(key) || { food_item_id: s.food_item_id, category_id: s.category_id, metrics: createMetricsBucket() };
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
            const existing = byItem.get(key) || { food_item_id: li.food_item_id, category_id: li.category_id, metrics: createMetricsBucket() };
            existing.metrics.impressions += li.metrics.impressions;
            existing.metrics.views += li.metrics.views;
            existing.metrics.add_to_cart += li.metrics.add_to_cart;
            existing.metrics.orders += li.metrics.orders;
            existing.metrics.unique_sessions += li.metrics.unique_sessions;
            byItem.set(key, existing);
        }
    }

    const items = Array.from(byItem.values()).map(mapAnalyticsItem);
    return { items: sortItems(items, sortBy).slice(0, limit), outlet_ids: outletIds };
};

export const getAnalyticsByCategory = async (categoryId: string, options: { outletId?: string; rangeStart: Date; rangeEndExclusive: Date; source?: string; limit?: number; sortBy?: string }) => {
    const { outletId, rangeStart, rangeEndExclusive, source, limit = 20, sortBy = 'views' } = options;
    const match: Record<string, unknown> = {
        category_id: new mongoose.Types.ObjectId(categoryId),
        timestamp: { $gte: rangeStart, $lt: rangeEndExclusive }
    };
    if (outletId) match.outlet_id = new mongoose.Types.ObjectId(outletId);
    if (source) match.source = source;

    const items = await aggregateFromEvents(match);
    return { items: sortItems(items, sortBy).slice(0, limit) };
};

export const getAnalyticsByItem = async (foodItemId: string, options: { rangeStart: Date; rangeEndExclusive: Date; source?: string }) => {
    const { rangeStart, rangeEndExclusive, source } = options;
    const todayStartUtc = startOfUtcDay(new Date());

    if (source) {
        const groups = await analyticsRepo.aggregateEvents([
            { $match: { food_item_id: new mongoose.Types.ObjectId(foodItemId), source, timestamp: { $gte: rangeStart, $lt: rangeEndExclusive } } },
            { $group: { _id: { dateKey: { $dateToString: { date: '$timestamp', format: '%Y-%m-%d', timezone: 'UTC' } }, event_type: '$event_type' }, count: { $sum: 1 } } }
        ]);

        const byDate = new Map<string, { date: string; impressions: number; views: number; add_to_cart: number; orders: number }>();
        for (const g of groups as any[]) {
            const key = g._id.dateKey;
            const row = byDate.get(key) || { date: key, impressions: 0, views: 0, add_to_cart: 0, orders: 0 };
            if (g._id.event_type === 'item_impression') row.impressions += g.count;
            if (g._id.event_type === 'item_view') row.views += g.count;
            if (g._id.event_type === 'add_to_cart') row.add_to_cart += g.count;
            if (g._id.event_type === 'order_created') row.orders += g.count;
            byDate.set(key, row);
        }

        return { daily: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)) };
    }

    const historyEnd = rangeEndExclusive.getTime() > todayStartUtc.getTime() ? todayStartUtc : rangeEndExclusive;
    const summaries = await analyticsRepo.findSummaries({
        food_item_id: foodItemId,
        date: { $gte: rangeStart, $lt: historyEnd },
    });

    const byKey = new Map<string, { date: string; impressions: number; views: number; add_to_cart: number; orders: number }>();
    for (const s of summaries as any[]) {
        const key = utcDateKey(s.date);
        byKey.set(key, { date: key, impressions: s.metrics.impressions || 0, views: s.metrics.views || 0, add_to_cart: s.metrics.add_to_cart || 0, orders: s.metrics.orders || 0 });
    }

    if (rangeEndExclusive.getTime() > todayStartUtc.getTime()) {
        const todayKey = utcDateKey(todayStartUtc);
        const live = await aggregateFromEvents({ food_item_id: new mongoose.Types.ObjectId(foodItemId), timestamp: { $gte: todayStartUtc, $lt: rangeEndExclusive } });
        const one = live[0];
        if (one) byKey.set(todayKey, { date: todayKey, impressions: one.metrics.impressions, views: one.metrics.views, add_to_cart: one.metrics.add_to_cart, orders: one.metrics.orders });
    }

    for (let dt = new Date(rangeStart); dt.getTime() < rangeEndExclusive.getTime(); dt = startOfNextUtcDay(dt)) {
        const key = utcDateKey(dt);
        if (!byKey.has(key)) byKey.set(key, { date: key, impressions: 0, views: 0, add_to_cart: 0, orders: 0 });
    }

    return { daily: Array.from(byKey.values()).sort((a, b) => a.date.localeCompare(b.date)) };
};

async function aggregateFromEvents(match: Record<string, unknown>): Promise<AnalyticsItem[]> {
    const groups = await analyticsRepo.aggregateEvents([
        { $match: match },
        {
            $group: {
                _id: { food_item_id: '$food_item_id', category_id: '$category_id', event_type: '$event_type' },
                count: { $sum: 1 },
                unique_sessions: { $addToSet: '$session_id' },
            },
        },
    ]);

    const byItem = new Map<string, AnalyticsItem & { unique_sessions_set: Set<string> }>();
    for (const g of groups as any[]) {
        const key = String(g._id.food_item_id);
        const bucket = byItem.get(key) || { food_item_id: g._id.food_item_id, category_id: g._id.category_id, metrics: createMetricsBucket(), unique_sessions_set: new Set<string>() };

        const et = g._id.event_type as string;
        if (et === 'item_impression') bucket.metrics.impressions += g.count;
        if (et === 'item_view') bucket.metrics.views += g.count;
        if (et === 'add_to_cart') bucket.metrics.add_to_cart += g.count;
        if (et === 'order_created') bucket.metrics.orders += g.count;
        for (const sid of g.unique_sessions || []) bucket.unique_sessions_set.add(String(sid));
        bucket.metrics.unique_sessions = bucket.unique_sessions_set.size;
        byItem.set(key, bucket);
    }

    return Array.from(byItem.values()).map(b => ({
        food_item_id: b.food_item_id,
        category_id: b.category_id,
        metrics: b.metrics
    }));
}
