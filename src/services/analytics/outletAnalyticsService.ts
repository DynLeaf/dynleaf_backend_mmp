import * as outletAnalyticsRepo from '../../repositories/analytics/outletAnalyticsRepository.js';
import * as outletRepo from '../../repositories/outletRepository.js';
import * as subscriptionUtils from '../../utils/subscriptionUtils.js';
import { normalizePlanToTier } from '../../config/subscriptionPlans.js';
import { pctChangeStatus, formatUtcDayKey, shiftDays } from '../../utils/analyticsUtils.js';
import { AnalyticsWindow } from '../../utils/analyticsRange.js';
import { OutletDashboardResponseDto } from '../../dto/analytics/outlet/outletDashboard.response.dto.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';
import mongoose from 'mongoose';

export const getBusinessDashboard = async (
    outletId: string,
    reqUser: any,
    rangeKey: string,
    start: Date,
    endExclusive: Date,
    days: number
): Promise<OutletDashboardResponseDto> => {
    const outlet = await outletRepo.findById(outletId);
    if (!outlet) throw new AppError('Outlet not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const outletObjectId = new mongoose.Types.ObjectId(outletId);
    let subscription = await outletRepo.findSubscriptionByOutletId(outletId);

    if (!subscription) {
        subscription = await subscriptionUtils.ensureSubscriptionForOutlet(outletId, {
            plan: 'free',
            status: 'active',
            assigned_by: reqUser?.id,
            notes: 'Auto-created on dashboard analytics access'
        }) as any;
    }

    if (!outlet.subscription_id || outlet.subscription_id.toString() !== (subscription as any)._id.toString()) {
        await outletRepo.updateById(outletId, { subscription_id: (subscription as any)._id });
    }

    const tier = normalizePlanToTier((subscription as any).plan);
    const isAllowed = tier === 'premium' && ['active', 'trial'].includes((subscription as any).status);
    if (!isAllowed) {
        throw new AppError('Subscription required', 403, ErrorCode.INSUFFICIENT_PERMISSIONS);
    }

    const prevStart = shiftDays(start, -days);

    const [currentCounts, prevCounts, dailyAgg, sessions] = await Promise.all([
        outletAnalyticsRepo.getOutletEventCounts(outletId, start, endExclusive),
        outletAnalyticsRepo.getOutletEventCounts(outletId, prevStart, start),
        outletAnalyticsRepo.getOutletDailySeries(outletId, start, endExclusive),
        outletAnalyticsRepo.getOutletSessionFunnel(outletId, start, endExclusive),
    ]);

    const dailyMap = new Map<string, any>();
    for (const row of dailyAgg) {
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

    const unique_sessions = sessions.length;
    const funnel = sessions.reduce(
        (acc: any, s: any) => {
            acc.visits += s.has_visit ? 1 : 0;
            acc.profile_sessions += s.has_profile ? 1 : 0;
            acc.menu_sessions += s.has_menu ? 1 : 0;
            return acc;
        },
        { visits: 0, profile_sessions: 0, menu_sessions: 0 }
    );

    const visit_to_profile_rate = funnel.visits > 0 ? parseFloat(((funnel.profile_sessions / funnel.visits) * 100).toFixed(2)) : 0;
    const visit_to_menu_rate = funnel.visits > 0 ? parseFloat(((funnel.menu_sessions / funnel.visits) * 100).toFixed(2)) : 0;
    const profile_to_menu_rate = funnel.profile_sessions > 0 ? parseFloat(((funnel.menu_sessions / funnel.profile_sessions) * 100).toFixed(2)) : 0;

    const device_breakdown = sessions.reduce((acc: any, s: any) => {
        const key = s.first_device || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const source_breakdown = sessions.reduce((acc: any, s: any) => {
        const key = (s.first_source && String(s.first_source).trim()) || 'direct';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    const entry_page_breakdown = sessions.reduce((acc: any, s: any) => {
        const key = s.first_entry_page || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    let new_sessions: number | null = null;
    let returning_sessions: number | null = null;

    const sessionIds = sessions.map((s: any) => String(s._id)).filter((sid: string) => sid && sid !== 'anonymous');

    if (sessionIds.length > 0 && sessionIds.length <= 2000) {
        returning_sessions = await outletAnalyticsRepo.getPriorSessionCount(outletId, sessionIds, start);
        new_sessions = sessionIds.length - returning_sessions;
    }

    return {
        outlet: { _id: String(outlet._id), name: (outlet as any).name as string },
        range: { key: rangeKey, start: start.toISOString(), end_exclusive: endExclusive.toISOString(), days },
        series,
        kpis: {
            outlet_visits: currentCounts.outlet_visits,
            profile_views: currentCounts.profile_views,
            menu_views: currentCounts.menu_views,
            unique_sessions,
            trends: {
                outlet_visits: pctChangeStatus(currentCounts.outlet_visits, prevCounts.outlet_visits),
                profile_views: pctChangeStatus(currentCounts.profile_views, prevCounts.profile_views),
                menu_views: pctChangeStatus(currentCounts.menu_views, prevCounts.menu_views),
            },
        },
        funnel: { ...funnel, visit_to_profile_rate, visit_to_menu_rate, profile_to_menu_rate },
        audience: { new_sessions, returning_sessions, device_breakdown, source_breakdown, entry_page_breakdown },
    };
};

export const getAdminOutletAnalytics = async (window: AnalyticsWindow) => {
    const outletsAgg = await outletAnalyticsRepo.aggregateAllOutletsEvents(window.start, window.end);
    const topOutletsAgg = outletsAgg?.[0]?.topOutlets || [];
    const totalsAgg = outletsAgg?.[0]?.totals || [];

    const outletIds = topOutletsAgg.map((d: any) => d._id);
    const outletDocs = await outletRepo.findByIds(outletIds);
    const outletNameById = new Map(outletDocs.map((o: any) => [String(o._id), o.name]));

    const totals = totalsAgg[0] || { totalProfileViews: 0, totalMenuViews: 0, totalOutletVisits: 0, uniqueOutletCount: 0, totalViews: 0 };
    const averageViewsPerOutlet = totals.uniqueOutletCount > 0 ? totals.totalViews / totals.uniqueOutletCount : 0;

    return {
        window: { range: window.range, start: window.start, end: window.end },
        totals: {
            totalViews: totals.totalViews || 0,
            totalProfileViews: totals.totalProfileViews || 0,
            totalMenuViews: totals.totalMenuViews || 0,
            totalOutletVisits: totals.totalOutletVisits || 0,
            uniqueOutlets: totals.uniqueOutletCount || 0,
            averageViewsPerOutlet,
        },
        topOutlets: topOutletsAgg.map((d: any) => ({
            id: String(d._id),
            name: outletNameById.get(String(d._id)) || 'Unknown',
            views: d.total_views || 0,
        })),
    };
};
