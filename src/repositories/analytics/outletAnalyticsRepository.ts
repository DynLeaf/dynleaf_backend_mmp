import mongoose from 'mongoose';
import { OutletAnalyticsEvent } from '../../models/OutletAnalyticsEvent.js';
import { OutletAnalyticsSummary } from '../../models/OutletAnalyticsSummary.js';

// Safe ObjectId converter — returns null for slugs/invalid values
const toOid = (id: string): mongoose.Types.ObjectId | null =>
    mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;

export const getTopOutletsByViews = async (start: Date, end: Date, limit: number = 10) => {
    return OutletAnalyticsSummary.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        {
            $group: {
                _id: '$outlet_id',
                profile_views: { $sum: '$metrics.profile_views' },
                menu_views: { $sum: '$metrics.menu_views' },
            },
        },
        { $addFields: { total_views: { $add: ['$profile_views', '$menu_views'] } } },
        { $sort: { total_views: -1 } },
        { $limit: limit },
    ]);
};

export const getOutletEventCounts = async (outletId: string, start: Date, endExclusive: Date) => {
    const oid = toOid(outletId);
    if (!oid) return { outlet_visits: 0, profile_views: 0, menu_views: 0 };
    const groups = await OutletAnalyticsEvent.aggregate([
        {
            $match: {
                outlet_id: oid,
                timestamp: { $gte: start, $lt: endExclusive },
            },
        },
        {
            $group: {
                _id: '$event_type',
                count: { $sum: 1 },
            },
        },
    ]);

    type AggResult = { _id: string; count: number };
    const get = (t: string) => groups.find((g: AggResult) => g._id === t)?.count || 0;

    return {
        outlet_visits: get('outlet_visit'),
        profile_views: get('profile_view'),
        menu_views: get('menu_view'),
    };
};

export const getOutletDailySeries = async (outletId: string, start: Date, endExclusive: Date) => {
    const oid = toOid(outletId);
    if (!oid) return [];
    return OutletAnalyticsEvent.aggregate([
        {
            $match: {
                outlet_id: oid,
                timestamp: { $gte: start, $lt: endExclusive },
            },
        },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: 'UTC' } },
                outlet_visits: { $sum: { $cond: [{ $eq: ['$event_type', 'outlet_visit'] }, 1, 0] } },
                profile_views: { $sum: { $cond: [{ $eq: ['$event_type', 'profile_view'] }, 1, 0] } },
                menu_views: { $sum: { $cond: [{ $eq: ['$event_type', 'menu_view'] }, 1, 0] } },
            },
        },
        { $sort: { _id: 1 } },
    ]);
};

export const getOutletSessionFunnel = async (outletId: string, start: Date, endExclusive: Date) => {
    const oid = toOid(outletId);
    if (!oid) return [];
    return OutletAnalyticsEvent.aggregate([
        {
            $match: {
                outlet_id: oid,
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
                has_visit: { $max: { $cond: [{ $eq: ['$event_type', 'outlet_visit'] }, 1, 0] } },
                has_profile: { $max: { $cond: [{ $eq: ['$event_type', 'profile_view'] }, 1, 0] } },
                has_menu: { $max: { $cond: [{ $eq: ['$event_type', 'menu_view'] }, 1, 0] } },
            },
        },
    ]);
};

export const getPriorSessionCount = async (outletId: string, sessionIds: string[], beforeDate: Date): Promise<number> => {
    const oid = toOid(outletId);
    if (!oid) return 0;
    const priorIds = await OutletAnalyticsEvent.distinct('session_id', {
        outlet_id: oid,
        session_id: { $in: sessionIds },
        timestamp: { $lt: beforeDate },
    });
    return priorIds.length;
};

export const aggregateAllOutletsEvents = async (start: Date, end: Date) => {
    return OutletAnalyticsEvent.aggregate([
        { $match: { timestamp: { $gte: start, $lte: end } } },
        { $group: { _id: { outlet_id: '$outlet_id', event_type: '$event_type' }, count: { $sum: 1 } } },
        {
            $group: {
                _id: '$_id.outlet_id',
                profile_views: { $sum: { $cond: [{ $eq: ['$_id.event_type', 'profile_view'] }, '$count', 0] } },
                menu_views: { $sum: { $cond: [{ $eq: ['$_id.event_type', 'menu_view'] }, '$count', 0] } },
                outlet_visits: { $sum: { $cond: [{ $eq: ['$_id.event_type', 'outlet_visit'] }, '$count', 0] } },
            },
        },
        { $addFields: { total_views: { $add: ['$profile_views', '$menu_views'] } } },
        {
            $facet: {
                topOutlets: [{ $sort: { total_views: -1 } }, { $limit: 10 }],
                totals: [
                    {
                        $group: {
                            _id: null,
                            totalProfileViews: { $sum: '$profile_views' },
                            totalMenuViews: { $sum: '$menu_views' },
                            totalOutletVisits: { $sum: '$outlet_visits' },
                            uniqueOutletCount: { $sum: 1 },
                            totalViews: { $sum: '$total_views' },
                        },
                    },
                ],
            },
        },
    ]);
};
