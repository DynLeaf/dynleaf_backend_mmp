import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { sendSuccess, sendError } from '../utils/response.js';
import * as outletService from '../services/outletService.js';
import * as analyticsRepo from '../repositories/analytics/outletAnalyticsEventRepository.js';

const ANALYTICS_CONFIG = { DEDUPE_MINUTES: 30, DEFAULT_DATE_RANGE_DAYS: 30, HOURS_IN_DAY: 24 } as const;
const EVENT_TYPES = { OUTLET_VISIT: 'outlet_visit', PROFILE_VIEW: 'profile_view', MENU_VIEW: 'menu_view' } as const;

type OutletTrackBody = { session_id?: string; entry_page?: 'menu' | 'profile'; source?: string; prev_path?: string; promotion_id?: string };
type DeviceType = 'mobile' | 'desktop' | 'tablet';
type GroupEntry = { _id: { event_type: string; device_type: DeviceType; hour: number }; count: number; unique_sessions: string[] };

const detectDevice = (ua: string): DeviceType => {
    if (/mobile/i.test(ua) && !/tablet|ipad/i.test(ua)) return 'mobile';
    if (/tablet|ipad/i.test(ua)) return 'tablet';
    return 'desktop';
};
const getIp = (req: Request) => (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress;
const toOid = (v?: string) => v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : undefined;
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfNextUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
const utcDateKey = (d: Date) => d.toISOString().slice(0, 10);

const parseDateRange = (from?: unknown, to?: unknown) => {
    const fb = new Date(Date.now() - ANALYTICS_CONFIG.DEFAULT_DATE_RANGE_DAYS * 86400000);
    const rawFrom = from ? new Date(from as string) : fb;
    const rawTo = to ? new Date(to as string) : new Date();
    return { rangeStart: startOfUtcDay(isNaN(rawFrom.getTime()) ? fb : rawFrom), rangeEndExclusive: startOfNextUtcDay(isNaN(rawTo.getTime()) ? new Date() : rawTo) };
};

const buildEventData = (outletId: string, body: OutletTrackBody, eventType: string, req: Request) => ({
    outlet_id: outletId,
    event_type: eventType,
    session_id: body.session_id || 'anonymous',
    device_type: detectDevice((req.headers['user-agent'] as string) || ''),
    user_agent: (req.headers['user-agent'] as string) || '',
    ip_address: getIp(req),
    entry_page: body.entry_page,
    source: body.source,
    prev_path: body.prev_path,
    promotion_id: toOid(body.promotion_id),
    timestamp: new Date()
});

export const trackOutletVisit = async (req: Request, res: Response) => {
    try {
        const outlet = await outletService.getOutletById(req.params.outletId);
        if (!outlet) return sendError(res, 'Outlet not found', 404);
        const outletId = String((outlet as unknown as { _id: { toString(): string } })._id);
        const sid = (req.body as OutletTrackBody).session_id || 'anonymous';
        const recent = await analyticsRepo.findRecentEvent(
            outletId, sid, EVENT_TYPES.OUTLET_VISIT,
            new Date(Date.now() - ANALYTICS_CONFIG.DEDUPE_MINUTES * 60000)
        );
        if (recent) return sendSuccess(res, { tracked: false, deduped: true });
        await analyticsRepo.createEvent(buildEventData(outletId, req.body as OutletTrackBody, EVENT_TYPES.OUTLET_VISIT, req));
        return sendSuccess(res, { tracked: true });
    } catch (error: unknown) { return sendError(res, `Visit tracking failed: ${(error as Error).message}`); }
};

export const trackOutletProfileView = async (req: Request, res: Response) => {
    try {
        const outlet = await outletService.getOutletById(req.params.outletId);
        if (!outlet) return sendError(res, 'Outlet not found', 404);
        const outletId = String((outlet as unknown as { _id: { toString(): string } })._id);
        await analyticsRepo.createEvent(buildEventData(outletId, req.body as OutletTrackBody, EVENT_TYPES.PROFILE_VIEW, req));
        return sendSuccess(res, { tracked: true });
    } catch (error: unknown) { return sendError(res, `Profile view tracking failed: ${(error as Error).message}`); }
};

export const trackOutletMenuView = async (req: Request, res: Response) => {
    try {
        const outlet = await outletService.getOutletById(req.params.outletId);
        if (!outlet) return sendError(res, 'Outlet not found', 404);
        const outletId = String((outlet as unknown as { _id: { toString(): string } })._id);
        await analyticsRepo.createEvent(buildEventData(outletId, req.body as OutletTrackBody, EVENT_TYPES.MENU_VIEW, req));
        return sendSuccess(res, { tracked: true });
    } catch (error: unknown) { return sendError(res, `Menu view tracking failed: ${(error as Error).message}`); }
};

const emptyDay = (dateKey: string) => ({ dateKey, outlet_visits: 0, profile_views: 0, menu_views: 0, unique_sessions: 0, view_to_menu_rate: 0, device_breakdown: { mobile: 0, desktop: 0, tablet: 0 }, hourly_breakdown: Array.from({ length: ANALYTICS_CONFIG.HOURS_IN_DAY }, (_, hour) => ({ hour, profile_views: 0, menu_views: 0 })) });
const emptyDevice = () => ({ mobile: 0, desktop: 0, tablet: 0 });
const emptyHourly = () => Array.from({ length: ANALYTICS_CONFIG.HOURS_IN_DAY }, (_, hour) => ({ hour, profile_views: 0, menu_views: 0 }));
const vmr = (pv: number, mv: number) => pv > 0 ? parseFloat(((mv / pv) * 100).toFixed(2)) : 0;

export const getOutletAnalytics = async (req: Request, res: Response) => {
    try {
        const outlet = await outletService.getOutletById(req.params.id);
        if (!outlet) return sendError(res, 'Outlet not found', 404);
        const outletId = String((outlet as unknown as { _id: { toString(): string } })._id);
        const { rangeStart, rangeEndExclusive } = parseDateRange(req.query.date_from, req.query.date_to);
        const summaries = await analyticsRepo.findSummaries(outletId, { $gte: rangeStart, $lt: rangeEndExclusive }) as Array<{ date: Date; metrics: Record<string, unknown>; device_breakdown: { mobile: number; desktop: number; tablet: number }; hourly_breakdown: Array<{ hour: number; profile_views: number; menu_views: number }> }>;
        const dailyByKey = new Map<string, ReturnType<typeof emptyDay>>();
        for (const s of summaries) {
            const key = utcDateKey(s.date);
            dailyByKey.set(key, { dateKey: key, outlet_visits: (s.metrics.outlet_visits as number) || 0, profile_views: s.metrics.profile_views as number, menu_views: s.metrics.menu_views as number, unique_sessions: s.metrics.unique_sessions as number, view_to_menu_rate: s.metrics.view_to_menu_rate as number, device_breakdown: s.device_breakdown, hourly_breakdown: s.hourly_breakdown });
        }
        const now = new Date();
        for (const dayStart of [new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)), startOfUtcDay(now)]) {
            if (dayStart.getTime() < rangeStart.getTime() || dayStart.getTime() >= rangeEndExclusive.getTime()) continue;
            const dayKey = utcDateKey(dayStart);
            const isToday = dayStart.getTime() === startOfUtcDay(now).getTime();
            if (!isToday && dailyByKey.has(dayKey)) continue;
            const groups = await analyticsRepo.aggregateLiveEvents(outletId, dayStart, startOfNextUtcDay(dayStart)) as GroupEntry[];
            if (!groups.length) continue;
            const ov = groups.filter(e => e._id.event_type === 'outlet_visit').reduce((s, e) => s + e.count, 0);
            const pv = groups.filter(e => e._id.event_type === 'profile_view').reduce((s, e) => s + e.count, 0);
            const mv = groups.filter(e => e._id.event_type === 'menu_view').reduce((s, e) => s + e.count, 0);
            const sessions = new Set(groups.flatMap(e => e.unique_sessions));
            const dev = emptyDevice(); dev.mobile = groups.filter(e => e._id.device_type === 'mobile').reduce((s, e) => s + e.count, 0); dev.desktop = groups.filter(e => e._id.device_type === 'desktop').reduce((s, e) => s + e.count, 0); dev.tablet = groups.filter(e => e._id.device_type === 'tablet').reduce((s, e) => s + e.count, 0);
            const hourly = Array.from({ length: ANALYTICS_CONFIG.HOURS_IN_DAY }, (_, h) => { const he = groups.filter(e => e._id.hour === h); return { hour: h, profile_views: he.filter(e => e._id.event_type === EVENT_TYPES.PROFILE_VIEW).reduce((s, e) => s + e.count, 0), menu_views: he.filter(e => e._id.event_type === EVENT_TYPES.MENU_VIEW).reduce((s, e) => s + e.count, 0) }; });
            const ex = dailyByKey.get(dayKey);
            if (ex) { dailyByKey.set(dayKey, { ...ex, outlet_visits: Math.max(ex.outlet_visits, ov), profile_views: Math.max(ex.profile_views, pv), menu_views: Math.max(ex.menu_views, mv), unique_sessions: Math.max(ex.unique_sessions, sessions.size), view_to_menu_rate: Math.max(ex.view_to_menu_rate, vmr(pv, mv)), device_breakdown: ex.device_breakdown || dev, hourly_breakdown: ex.hourly_breakdown?.length ? ex.hourly_breakdown : hourly });
            } else { dailyByKey.set(dayKey, { dateKey: dayKey, outlet_visits: ov, profile_views: pv, menu_views: mv, unique_sessions: sessions.size, view_to_menu_rate: vmr(pv, mv), device_breakdown: dev, hourly_breakdown: hourly }); }
        }
        for (let dt = new Date(rangeStart); dt.getTime() < rangeEndExclusive.getTime(); dt = startOfNextUtcDay(dt)) { const k = utcDateKey(dt); if (!dailyByKey.has(k)) dailyByKey.set(k, emptyDay(k)); }
        const sorted = Array.from(dailyByKey.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
        const summary = sorted.reduce((acc, d) => { acc.outlet_visits += d.outlet_visits; acc.profile_views += d.profile_views; acc.menu_views += d.menu_views; acc.unique_sessions += d.unique_sessions; return acc; }, { outlet_visits: 0, profile_views: 0, menu_views: 0, unique_sessions: 0 });
        const devTotals = emptyDevice(); const hourlyTotals = emptyHourly();
        for (const d of sorted) { devTotals.mobile += d.device_breakdown.mobile; devTotals.desktop += d.device_breakdown.desktop; devTotals.tablet += d.device_breakdown.tablet; d.hourly_breakdown.forEach(h => { hourlyTotals[h.hour].profile_views += h.profile_views; hourlyTotals[h.hour].menu_views += h.menu_views; }); }
        return sendSuccess(res, { outlet: { _id: (outlet as unknown as { _id: unknown })._id, name: (outlet as unknown as { name: string }).name }, summary: { ...summary, view_to_menu_rate: vmr(summary.profile_views, summary.menu_views) }, daily_breakdown: sorted.map(d => ({ date: d.dateKey, outlet_visits: d.outlet_visits, profile_views: d.profile_views, menu_views: d.menu_views, unique_sessions: d.unique_sessions, view_to_menu_rate: d.view_to_menu_rate })), device_breakdown: devTotals, hourly_pattern: hourlyTotals });
    } catch (error: unknown) { return sendError(res, (error as Error).message || 'Failed to fetch outlet analytics'); }
};
