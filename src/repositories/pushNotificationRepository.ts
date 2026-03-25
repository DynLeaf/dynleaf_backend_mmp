import { PushNotification } from '../models/PushNotification.js';
import {
    DeliveryStatus,
    TargetAudienceType,
} from '../types/notifications.js';

export { DeliveryStatus, TargetAudienceType };

export const create = async (data: Record<string, unknown>) => {
    const doc = await new PushNotification(
        data as ConstructorParameters<typeof PushNotification>[0]
    ).save();
    return JSON.parse(JSON.stringify(doc.toObject()));
};

export const findById = async (id: string) => {
    return await PushNotification.findById(id)
        .populate('created_by', 'username email phone')
        .lean();
};

export const findByIdRaw = async (id: string) => {
    return await PushNotification.findById(id);
};

export const findWithFilters = async (
    query: Record<string, unknown>,
    skip: number,
    limit: number
) => {
    const [notifications, total] = await Promise.all([
        PushNotification.find(query as unknown as Parameters<typeof PushNotification.find>[0])
            .populate('created_by', 'username email phone')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        PushNotification.countDocuments(
            query as unknown as Parameters<typeof PushNotification.countDocuments>[0]
        )
    ]);
    return { notifications, total };
};

export const findByIdProjection = async (id: string, fields: Record<string, number>) => {
    return await PushNotification.findById(id, fields).lean();
};

export const updateById = async (id: string, updates: Record<string, unknown>) => {
    return await PushNotification.findByIdAndUpdate(id, updates, { new: true }).lean();
};

export const deleteById = async (id: string) => {
    return await PushNotification.findByIdAndDelete(id).lean();
};

export const countByStatus = async () => {
    const [total, draft, scheduled, sent, failed] = await Promise.all([
        PushNotification.countDocuments(),
        PushNotification.countDocuments({ status: DeliveryStatus.DRAFT }),
        PushNotification.countDocuments({ status: DeliveryStatus.SCHEDULED }),
        PushNotification.countDocuments({ status: DeliveryStatus.SENT }),
        PushNotification.countDocuments({ status: DeliveryStatus.FAILED }),
    ]);
    return { total, draft, scheduled, sent, failed };
};

export const aggregateDeliveryStats = async () => {
    const [totalSent, totalClicks] = await Promise.all([
        PushNotification.aggregate([
            { $group: { _id: null, total: { $sum: '$delivery_metrics.sent' } } }
        ]),
        PushNotification.aggregate([
            { $group: { _id: null, total: { $sum: '$analytics.clicks' } } }
        ]),
    ]);
    return {
        total_sent: totalSent[0]?.total || 0,
        total_clicks: totalClicks[0]?.total || 0,
    };
};

export const findScheduledReady = async (now: Date) => {
    return await PushNotification.find({
        status: { $in: [DeliveryStatus.SCHEDULED, DeliveryStatus.QUEUED] },
        'scheduling.scheduled_at': { $lte: now },
    });
};

export const findFailedRetryable = async () => {
    return await PushNotification.find({
        status: DeliveryStatus.FAILED,
        'retry_policy.max_retries': { $gt: 0 },
    });
};

export const findSentOrPartiallySent = async () => {
    return await PushNotification.find({
        status: { $in: [DeliveryStatus.SENT, DeliveryStatus.PARTIALLY_SENT] }
    }).sort({ sent_at: -1 }).lean();
};
