import * as pushNotifRepo from '../repositories/pushNotificationRepository.js';
import * as dispatchService from './notificationDispatchService.js';
import * as pushNotifService from './pushNotificationService.js';
import { AppError, ErrorCode } from '../errors/AppError.js';
import { SendPushRequestDto } from '../dto/notifications/sendPush.request.dto.js';

const NOTIFICATION_TYPE_DEFAULT = 'promotional';

export const createCampaign = async (dto: SendPushRequestDto, userId: string) => {
    if (!dto.title?.trim()) throw new AppError('Title is required', 400, ErrorCode.VALIDATION_ERROR);
    if (!dto.description?.trim()) throw new AppError('Description is required', 400, ErrorCode.VALIDATION_ERROR);
    if (!dto.target_audience?.type) throw new AppError('Target audience type is required', 400, ErrorCode.VALIDATION_ERROR);
    if (!dto.scheduling?.type) throw new AppError('Scheduling type is required', 400, ErrorCode.VALIDATION_ERROR);

    if (dto.scheduling.type === 'scheduled') {
        if (!dto.scheduling.scheduled_at) throw new AppError('scheduled_at is required for scheduled type', 400, ErrorCode.VALIDATION_ERROR);
        if (new Date(dto.scheduling.scheduled_at) < new Date()) throw new AppError('scheduled_at cannot be in the past', 400, ErrorCode.VALIDATION_ERROR);
    }

    const resolvedUserId = await dispatchService.resolveUserId(userId);
    if (!resolvedUserId) throw new AppError('Admin user not found', 401, ErrorCode.INVALID_CREDENTIALS);

    const data: Record<string, unknown> = {
        title: dto.title.trim(),
        description: dto.description.trim(),
        content: {
            title: dto.title.trim(),
            description: dto.description.trim(),
            image_url: dto.image_url || undefined,
            image_public_id: dto.image_public_id || undefined,
            custom_data: dto.custom_data || {},
        },
        target_audience: dto.target_audience,
        scheduling: dto.scheduling,
        notification_type: dto.notification_type || NOTIFICATION_TYPE_DEFAULT,
        created_by: resolvedUserId,
        status: dto.scheduling.type === 'immediate' ? 'draft' : 'scheduled',
        events: [{ event_type: 'created', timestamp: new Date(), metadata: { created_by_user_id: userId } }],
    };

    return await pushNotifRepo.create(data);
};

export const listCampaigns = async (query: Record<string, unknown>) => {
    const page = parseInt(String(query.page ?? 1));
    const limit = parseInt(String(query.limit ?? 10));
    const status = query.status as string | undefined;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (status && status !== 'all') filter.status = status;

    const { notifications, total } = await pushNotifRepo.findWithFilters(filter, skip, limit);

    const enriched = notifications.map((n) => {
        const item = n as unknown as Record<string, unknown>;
        const dm = item.delivery_metrics as Record<string, number> | undefined;
        const analytics = item.analytics as Record<string, number> | undefined;
        const sent = dm?.sent ?? 0;
        const clicks = analytics?.clicks ?? 0;
        return { ...item, computed_ctr: sent === 0 ? 0 : (clicks / sent) * 100 };
    });

    return { notifications: enriched, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
};

export const getCampaignDetail = async (id: string) => {
    const notification = await pushNotifRepo.findById(id);
    if (!notification) throw new AppError('Notification not found', 404, ErrorCode.RESOURCE_NOT_FOUND);
    return notification;
};

export const updateCampaign = async (id: string, updates: Record<string, unknown>) => {
    const notification = await pushNotifRepo.findByIdRaw(id);
    if (!notification) throw new AppError('Notification not found', 404, ErrorCode.RESOURCE_NOT_FOUND);
    if (notification.status !== 'draft') throw new AppError(`Cannot edit ${notification.status} notifications`, 400, ErrorCode.VALIDATION_ERROR);

    if (updates.title && !(updates.title as string).trim()) throw new AppError('Title cannot be empty', 400, ErrorCode.VALIDATION_ERROR);
    if (updates.description && !(updates.description as string).trim()) throw new AppError('Description cannot be empty', 400, ErrorCode.VALIDATION_ERROR);

    const sched = updates.scheduling as Record<string, unknown> | undefined;
    if (sched?.type === 'scheduled') {
        if (!sched.scheduled_at) throw new AppError('scheduled_at is required', 400, ErrorCode.VALIDATION_ERROR);
        if (new Date(sched.scheduled_at as string) < new Date()) throw new AppError('scheduled_at cannot be in the past', 400, ErrorCode.VALIDATION_ERROR);
    }

    if (updates.title) { notification.title = (updates.title as string).trim(); notification.content.title = notification.title; }
    if (updates.description) { notification.description = (updates.description as string).trim(); notification.content.description = notification.description; }
    if (updates.image_url !== undefined) { notification.content.image_url = updates.image_url as string; notification.content.image_public_id = updates.image_public_id as string; }
    if (updates.target_audience) notification.target_audience = updates.target_audience as typeof notification.target_audience;
    if (updates.scheduling) notification.scheduling = updates.scheduling as typeof notification.scheduling;

    await notification.save();
    return notification.toJSON();
};

export const sendCampaign = async (id: string, senderId: string) => {
    const notification = await pushNotifRepo.findByIdRaw(id);
    if (!notification) throw new AppError('Notification not found', 404, ErrorCode.RESOURCE_NOT_FOUND);
    if (!['draft', 'scheduled'].includes(notification.status)) throw new AppError(`Cannot send ${notification.status} notifications`, 400, ErrorCode.VALIDATION_ERROR);

    notification.status = 'sending' as typeof notification.status;
    notification.sent_at = new Date();
    await notification.save();

    const audience = notification.target_audience as unknown as { type: string; user_ids?: string[]; roles?: string[] };
    const targetUserIds = await dispatchService.resolveTargetUserIds(audience);
    const { usersWithTokens, usersWithoutTokens } = await dispatchService.resolveTokenUsers(targetUserIds);

    if (usersWithTokens.length === 0) {
        notification.status = 'failed' as typeof notification.status;
        notification.delivery_metrics.total_recipients = targetUserIds.length;
        notification.delivery_metrics.failed = targetUserIds.length;
        await notification.save();
        throw new AppError('No users with FCM tokens to send notification to', 400, ErrorCode.VALIDATION_ERROR);
    }

    const result = await pushNotifService.sendToUsers(
        targetUserIds, notification.content.title, notification.content.description,
        (process.env.FRONTEND_URL || 'https://www.dynleaf.com').toString(),
        notification.content.image_url, String(id), undefined
    );

    notification.delivery_metrics.sent = result.success;
    notification.delivery_metrics.failed = result.failure;
    notification.delivery_metrics.pending = 0;
    notification.status = (result.failure === 0 ? 'sent' : 'partially_sent') as typeof notification.status;
    await notification.save();

    const sentUserDetails = usersWithTokens.map((u) => {
        const user = u as unknown as Record<string, unknown>;
        return {
            _id: String(user._id), name: user.username as string,
            phone: (user.phone as string) || 'N/A', email: user.email as string,
            tokens_count: ((user.fcm_tokens as string[])?.length) || 0,
        };
    });

    return {
        _id: notification._id, status: notification.status,
        total_targeted: targetUserIds.length, successfully_sent: result.success,
        failed: result.failure, users_with_tokens: usersWithTokens.length,
        users_without_tokens: usersWithoutTokens.length, user_details: sentUserDetails,
        message: `Notification sent to ${result.success} user(s) successfully`,
    };
};

export const deleteCampaign = async (id: string) => {
    const notification = await pushNotifRepo.findByIdRaw(id);
    if (!notification) throw new AppError('Notification not found', 404, ErrorCode.RESOURCE_NOT_FOUND);
    if (notification.status !== 'draft') throw new AppError(`Cannot delete ${notification.status} notifications`, 400, ErrorCode.VALIDATION_ERROR);
    await pushNotifRepo.deleteById(id);
    return { _id: id };
};

export const getCampaignAnalytics = async (id: string) => {
    const notification = await pushNotifRepo.findByIdProjection(id, { analytics: 1, delivery_metrics: 1, events: 1, created_at: 1, sent_at: 1 });
    if (!notification) throw new AppError('Notification not found', 404, ErrorCode.RESOURCE_NOT_FOUND);
    const n = notification as unknown as Record<string, unknown>;
    const dm = n.delivery_metrics as Record<string, number>;
    const analytics = n.analytics as Record<string, number>;
    const ctr = dm.sent === 0 ? 0 : (analytics.clicks / dm.sent) * 100;
    return { _id: n._id, delivery_metrics: dm, analytics: { ...analytics, ctr }, events: n.events, created_at: n.created_at, sent_at: n.sent_at };
};

export const getCampaignStats = async () => {
    const statusCounts = await pushNotifRepo.countByStatus();
    const deliveryStats = await pushNotifRepo.aggregateDeliveryStats();
    return {
        total_notifications: statusCounts.total,
        by_status: { draft: statusCounts.draft, scheduled: statusCounts.scheduled, sent: statusCounts.sent, failed: statusCounts.failed },
        delivery_stats: deliveryStats,
    };
};

export const recordEvent = async (id: string, eventType: string, userId: string, metadata?: Record<string, unknown>) => {
    const notification = await pushNotifRepo.findByIdRaw(id);
    if (!notification) throw new AppError('Notification not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    if (eventType === 'clicked') {
        notification.analytics.clicks += 1;
        notification.delivery_metrics.clicked = (notification.delivery_metrics.clicked || 0) + 1;
    } else if (eventType === 'dismissed') {
        notification.delivery_metrics.dismissed = (notification.delivery_metrics.dismissed || 0) + 1;
    }

    const resolvedUserId = await dispatchService.resolveUserId(userId);
    notification.events.push({ event_type: eventType as 'clicked' | 'dismissed', timestamp: new Date(), metadata: { user_id: resolvedUserId, ...metadata } });
    await notification.save();
};

export const processScheduled = async () => {
    const scheduled = await pushNotifRepo.findScheduledReady(new Date());
    for (const notification of scheduled) {
        try { await sendCampaign(String(notification._id), 'system'); } catch (err: unknown) { console.error(`Failed scheduled ${notification._id}:`, err); }
    }
    return { processed: scheduled.length };
};

export const retryFailed = async () => {
    const failed = await pushNotifRepo.findFailedRetryable();
    let retried = 0;
    for (const notification of failed) {
        const retriesAttempted = notification.events.filter(e => e.event_type === 'sent').length;
        if (retriesAttempted >= notification.retry_policy.max_retries) continue;
        try { await sendCampaign(String(notification._id), 'system'); retried++; } catch (err: unknown) { console.error(`Failed retry ${notification._id}:`, err); }
    }
    return { attempted: failed.length, retried };
};
