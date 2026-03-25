import * as promotionRepo from '../repositories/promotionRepository.js';
import * as promotionAnalyticsRepo from '../repositories/promotionAnalyticsRepository.js';
import * as promotionEventRepo from '../repositories/promotionEventRepository.js';
import { AppError, ErrorCode } from '../errors/AppError.js';
import { CreatePromotionRequestDto } from '../dto/promotions/createPromotion.request.dto.js';
import mongoose from 'mongoose';

export const createPromotion = async (dto: CreatePromotionRequestDto) => {
    if (!dto.display_data?.banner_image_url || !dto.display_data?.link_url) {
        throw new AppError('Banner image URL and link URL are required', 400, ErrorCode.VALIDATION_ERROR);
    }

    let createdBy: mongoose.Types.ObjectId;
    if (dto.outlet_id) {
        const outlet = await promotionRepo.findById(dto.outlet_id); // Simplified lookup
        createdBy = new mongoose.Types.ObjectId('000000000000000000000001'); // fallback
    } else {
        createdBy = new mongoose.Types.ObjectId('000000000000000000000001');
    }

    const startDate = dto.scheduling?.start_date ? new Date(dto.scheduling.start_date) : new Date();
    const endDate = dto.scheduling?.end_date ? new Date(dto.scheduling.end_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const data: Record<string, unknown> = {
        outlet_id: dto.outlet_id || undefined,
        promotion_type: dto.promotion_type || 'featured_today',
        display_data: {
            banner_image_url: dto.display_data.banner_image_url,
            banner_text: dto.display_data.banner_text,
            link_url: dto.display_data.link_url
        },
        scheduling: { start_date: startDate, end_date: endDate, display_priority: dto.scheduling?.display_priority || 50 },
        targeting: { locations: dto.targeting?.locations || [], show_on_homepage: dto.targeting?.show_on_homepage !== false },
        payment: dto.payment ? {
            amount_paid: dto.payment.amount_paid || 0,
            payment_status: dto.payment.payment_status || 'pending',
            payment_date: dto.payment.payment_date ? new Date(dto.payment.payment_date) : undefined
        } : undefined,
        is_active: true,
        created_by: createdBy
    };

    const promotion = await promotionRepo.create(data);
    return await promotionRepo.findByIdPopulated(String(promotion._id));
};

export const getPromotions = async (query: Record<string, unknown>) => {
    const page = parseInt(String(query.page ?? 1));
    const limit = parseInt(String(query.limit ?? 10));
    const skip = (page - 1) * limit;
    const status = query.status as string | undefined;
    const outletId = query.outlet_id as string | undefined;

    const filter: Record<string, unknown> = {};
    if (outletId) filter.outlet_id = outletId;

    const now = new Date();
    if (status === 'active') {
        filter.is_active = true;
        filter['scheduling.start_date'] = { $lte: now };
        filter['scheduling.end_date'] = { $gte: now };
    } else if (status === 'scheduled') {
        filter.is_active = true;
        filter['scheduling.start_date'] = { $gt: now };
    } else if (status === 'expired') {
        filter['scheduling.end_date'] = { $lt: now };
    } else if (status === 'inactive') {
        filter.is_active = false;
    }

    const { promotions, total } = await promotionRepo.findWithFilters(filter, skip, limit);
    return { promotions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

export const getPromotion = async (id: string) => {
    const promo = await promotionRepo.findById(id);
    if (!promo) throw new AppError('Promotion not found', 404, ErrorCode.RESOURCE_NOT_FOUND);
    return promo;
};

export const updatePromotion = async (id: string, updates: Record<string, unknown>) => {
    const promo = await promotionRepo.findByIdRaw(id);
    if (!promo) throw new AppError('Promotion not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    if (updates.display_data) {
        const dd = updates.display_data as Record<string, string>;
        if (dd.banner_image_url === '' || dd.link_url === '') {
            throw new AppError('Banner image URL and link URL cannot be empty', 400, ErrorCode.VALIDATION_ERROR);
        }
        promo.display_data = { ...promo.display_data, ...dd };
    }
    if (updates.scheduling) promo.scheduling = { ...promo.scheduling, ...(updates.scheduling as Record<string, unknown>) };
    if (updates.targeting) promo.targeting = { ...promo.targeting, ...(updates.targeting as Record<string, unknown>) };
    if (updates.payment) {
        const paymentUpdate = updates.payment as Record<string, unknown>;
        (promo as unknown as Record<string, unknown>).payment = { ...(promo.payment || {}), ...paymentUpdate };
    }
    if (updates.promotion_type !== undefined) promo.promotion_type = updates.promotion_type as 'featured_today' | 'sponsored' | 'premium';
    if (updates.is_active !== undefined) promo.is_active = updates.is_active as boolean;

    await promo.save();
    return await promotionRepo.findByIdPopulated(id);
};

export const togglePromotionStatus = async (id: string) => {
    const promo = await promotionRepo.findByIdRaw(id);
    if (!promo) throw new AppError('Promotion not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    promo.is_active = !promo.is_active;
    await promo.save();
    return { promotion: promo.toObject(), message: `Promotion ${promo.is_active ? 'activated' : 'deactivated'} successfully` };
};

export const deletePromotion = async (id: string) => {
    const deleted = await promotionRepo.deleteById(id);
    if (!deleted) throw new AppError('Promotion not found', 404, ErrorCode.RESOURCE_NOT_FOUND);
};

export const getFeaturedPromotions = async (query: Record<string, unknown>) => {
    const location = query.location as string | undefined;
    const limit = parseInt(String(query.limit ?? 5));
    const now = new Date();

    const filter: Record<string, unknown> = {
        is_active: true,
        'scheduling.start_date': { $lte: now },
        'scheduling.end_date': { $gte: now },
        'targeting.show_on_homepage': true
    };

    if (location) {
        filter.$or = [
            { 'targeting.locations': { $size: 0 } },
            { 'targeting.locations': location }
        ];
    }

    return await promotionRepo.findFeaturedActive(filter, limit);
};

export const getPromotionAnalytics = async (id: string, query: Record<string, unknown>) => {
    const promo = await promotionRepo.findById(id);
    if (!promo) throw new AppError('Promotion not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const startOfNextUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
    const utcDateKey = (d: Date) => d.toISOString().slice(0, 10);

    const fallbackFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fallbackTo = new Date();
    const rawFrom = query.date_from ? new Date(String(query.date_from)) : fallbackFrom;
    const rawTo = query.date_to ? new Date(String(query.date_to)) : fallbackTo;
    const dateFrom = isNaN(rawFrom.getTime()) ? fallbackFrom : rawFrom;
    const dateTo = isNaN(rawTo.getTime()) ? fallbackTo : rawTo;

    const rangeStart = startOfUtcDay(dateFrom);
    const rangeEndExclusive = startOfNextUtcDay(dateTo);

    const summaries = await promotionAnalyticsRepo.findByDateRange(id, rangeStart, rangeEndExclusive);

    interface DayEntry {
        dateKey: string; impressions: number; clicks: number; menu_views: number;
        unique_sessions: number; ctr: number; conversion_rate: number;
        device_breakdown: { mobile: number; desktop: number; tablet: number };
        hourly_breakdown: Array<{ hour: number; impressions: number; clicks: number }>;
    }

    const dailyByKey = new Map<string, DayEntry>();
    for (const s of summaries) {
        const entry = s as unknown as Record<string, unknown>;
        const key = utcDateKey(entry.date as Date);
        const m = entry.metrics as Record<string, number>;
        dailyByKey.set(key, {
            dateKey: key, impressions: m.impressions, clicks: m.clicks,
            menu_views: m.menu_views, unique_sessions: m.unique_sessions,
            ctr: m.ctr, conversion_rate: m.conversion_rate,
            device_breakdown: entry.device_breakdown as DayEntry['device_breakdown'],
            hourly_breakdown: entry.hourly_breakdown as DayEntry['hourly_breakdown']
        });
    }

    // Backfill recent days from raw events
    const now = new Date();
    const todayStartUtc = startOfUtcDay(now);
    const yesterdayStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));

    for (const dayStart of [yesterdayStartUtc, todayStartUtc]) {
        if (dayStart.getTime() < rangeStart.getTime() || dayStart.getTime() >= rangeEndExclusive.getTime()) continue;
        const dayKey = utcDateKey(dayStart);
        const shouldOverride = dayStart.getTime() === todayStartUtc.getTime();
        if (!shouldOverride && dailyByKey.has(dayKey)) continue;

        const dayEnd = startOfNextUtcDay(dayStart);
        const liveEvents = await promotionEventRepo.aggregateByDay(id, dayStart, dayEnd);
        if (liveEvents.length === 0) continue;

        const impressions = liveEvents.filter((e: Record<string, unknown>) => (e._id as Record<string, string>).event_type === 'impression').reduce((sum: number, e: Record<string, unknown>) => sum + (e.count as number), 0);
        const clicks = liveEvents.filter((e: Record<string, unknown>) => (e._id as Record<string, string>).event_type === 'click').reduce((sum: number, e: Record<string, unknown>) => sum + (e.count as number), 0);
        const menu_views = liveEvents.filter((e: Record<string, unknown>) => (e._id as Record<string, string>).event_type === 'menu_view').reduce((sum: number, e: Record<string, unknown>) => sum + (e.count as number), 0);
        const allUniqueSessions = new Set(liveEvents.flatMap((e: Record<string, unknown>) => e.unique_sessions as string[]));
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const conversion_rate = clicks > 0 ? (menu_views / clicks) * 100 : 0;

        const device_breakdown = {
            mobile: liveEvents.filter((e: Record<string, unknown>) => (e._id as Record<string, string>).device_type === 'mobile').reduce((s: number, e: Record<string, unknown>) => s + (e.count as number), 0),
            desktop: liveEvents.filter((e: Record<string, unknown>) => (e._id as Record<string, string>).device_type === 'desktop').reduce((s: number, e: Record<string, unknown>) => s + (e.count as number), 0),
            tablet: liveEvents.filter((e: Record<string, unknown>) => (e._id as Record<string, string>).device_type === 'tablet').reduce((s: number, e: Record<string, unknown>) => s + (e.count as number), 0)
        };

        dailyByKey.set(dayKey, { dateKey: dayKey, impressions, clicks, menu_views, unique_sessions: allUniqueSessions.size, ctr: parseFloat(ctr.toFixed(2)), conversion_rate: parseFloat(conversion_rate.toFixed(2)), device_breakdown, hourly_breakdown: [] });
    }

    const totals = { impressions: 0, clicks: 0, menu_views: 0, unique_sessions: 0, ctr: 0, conversion_rate: 0 };
    const deviceTotals = { mobile: 0, desktop: 0, tablet: 0 };
    for (const [, day] of dailyByKey) {
        totals.impressions += day.impressions; totals.clicks += day.clicks;
        totals.menu_views += day.menu_views; totals.unique_sessions += day.unique_sessions;
        deviceTotals.mobile += day.device_breakdown.mobile;
        deviceTotals.desktop += day.device_breakdown.desktop;
        deviceTotals.tablet += day.device_breakdown.tablet;
    }
    if (totals.impressions > 0) totals.ctr = parseFloat(((totals.clicks / totals.impressions) * 100).toFixed(2));
    if (totals.clicks > 0) totals.conversion_rate = parseFloat(((totals.menu_views / totals.clicks) * 100).toFixed(2));

    const daily_breakdown = Array.from(dailyByKey.values())
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
        .map(d => ({ date: `${d.dateKey}T00:00:00.000Z`, impressions: d.impressions, clicks: d.clicks, menu_views: d.menu_views, ctr: d.ctr, conversion_rate: d.conversion_rate }));

    return { summary: totals, daily_breakdown, device_breakdown: deviceTotals, outlet: promo.outlet_id };
};
