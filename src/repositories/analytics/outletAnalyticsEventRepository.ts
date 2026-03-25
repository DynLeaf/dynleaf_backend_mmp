import { OutletAnalyticsEvent } from '../../models/OutletAnalyticsEvent.js';
import { OutletAnalyticsSummary } from '../../models/OutletAnalyticsSummary.js';
import mongoose from 'mongoose';

interface AnalyticsEventData {
    outlet_id: string;
    event_type: string;
    session_id: string;
    device_type: 'mobile' | 'desktop' | 'tablet';
    user_agent: string;
    ip_address: string | undefined;
    entry_page?: string;
    source?: string;
    prev_path?: string;
    promotion_id?: mongoose.Types.ObjectId;
    timestamp: Date;
}

export const findRecentEvent = (
    outletId: string,
    sessionId: string,
    eventType: string,
    since: Date
) =>
    OutletAnalyticsEvent.findOne({
        outlet_id: outletId,
        session_id: sessionId,
        event_type: eventType,
        timestamp: { $gte: since }
    }).select('_id');

export const createEvent = (data: AnalyticsEventData) =>
    OutletAnalyticsEvent.create(data);

export const findSummaries = (outletId: string, dateRange: { $gte: Date; $lt: Date }) =>
    OutletAnalyticsSummary.find({ outlet_id: outletId, date: dateRange }).sort({ date: 1 });

export const aggregateLiveEvents = (outletId: string, dayStart: Date, dayEnd: Date): Promise<unknown[]> =>
    OutletAnalyticsEvent.aggregate([
        { $match: { outlet_id: outletId, timestamp: { $gte: dayStart, $lt: dayEnd } } },
        { $group: { _id: { event_type: '$event_type', device_type: '$device_type', hour: { $hour: '$timestamp' } }, count: { $sum: 1 }, unique_sessions: { $addToSet: '$session_id' } } }
    ]);

export const aggregateEvents = async (pipeline: any[]) => {
    return await OutletAnalyticsEvent.aggregate(pipeline);
};

export const distinctEvents = async (field: string, filter: any) => {
    return await OutletAnalyticsEvent.distinct(field, filter);
};

export const findEvents = async (filter: any, sort?: any) => {
    const query = OutletAnalyticsEvent.find(filter);
    if (sort) query.sort(sort);
    return await query;
};

export const insertMany = async (events: any[]) => {
    return await OutletAnalyticsEvent.insertMany(events, { ordered: false });
};
