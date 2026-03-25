import { Response } from 'express';
import type { AuthRequest } from '../middleware/authMiddleware.js';
import * as campaignService from '../services/notificationCampaignService.js';
import { getS3Service } from '../services/s3Service.js';
import { sendSuccess, sendError } from '../utils/response.js';

export const createPushNotification = async (req: AuthRequest, res: Response) => {
    try {
        const result = await campaignService.createCampaign(req.body, req.user.id);
        return sendSuccess(res, result, 'Push notification created successfully', 201);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to create push notification', err.statusCode ?? 500);
    }
};

export const getPushNotifications = async (req: AuthRequest, res: Response) => {
    try {
        const result = await campaignService.listCampaigns(req.query as Record<string, unknown>);
        return sendSuccess(res, result);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to fetch notifications', err.statusCode ?? 500);
    }
};

export const getPushNotificationDetail = async (req: AuthRequest, res: Response) => {
    try {
        const notification = await campaignService.getCampaignDetail(req.params.id);
        return sendSuccess(res, notification);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to fetch notification', err.statusCode ?? 500);
    }
};

export const updatePushNotification = async (req: AuthRequest, res: Response) => {
    try {
        const result = await campaignService.updateCampaign(req.params.id, req.body);
        return sendSuccess(res, result, 'Notification updated successfully');
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to update notification', err.statusCode ?? 500);
    }
};

export const sendPushNotification = async (req: AuthRequest, res: Response) => {
    try {
        const result = await campaignService.sendCampaign(req.params.id, req.user.id);
        return sendSuccess(res, result, `Notification sent to ${result.successfully_sent}/${result.total_targeted} recipients`);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to send notification', err.statusCode ?? 500);
    }
};

export const deletePushNotification = async (req: AuthRequest, res: Response) => {
    try {
        const result = await campaignService.deleteCampaign(req.params.id);
        return sendSuccess(res, result, 'Notification deleted successfully');
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to delete notification', err.statusCode ?? 500);
    }
};

export const getPushNotificationAnalytics = async (req: AuthRequest, res: Response) => {
    try {
        const result = await campaignService.getCampaignAnalytics(req.params.id);
        return sendSuccess(res, result);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to fetch analytics', err.statusCode ?? 500);
    }
};

export const recordNotificationEvent = async (req: AuthRequest, res: Response) => {
    try {
        const { event_type, metadata } = req.body;
        const validEvents = ['clicked', 'dismissed'];
        if (!validEvents.includes(event_type)) {
            return sendError(res, `Invalid event type. Must be one of: ${validEvents.join(', ')}`, 400);
        }
        await campaignService.recordEvent(req.params.notificationId, event_type, req.user?.id || '', metadata);
        return sendSuccess(res, { event_type, recorded_at: new Date() }, 'Event recorded');
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to record event', err.statusCode ?? 500);
    }
};

export const getPushNotificationStats = async (req: AuthRequest, res: Response) => {
    try {
        const result = await campaignService.getCampaignStats();
        return sendSuccess(res, result);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to fetch stats', err.statusCode ?? 500);
    }
};

export const getCloudinarySignatureForNotification = async (req: AuthRequest, res: Response) => {
    try {
        const s3Service = getS3Service();
        const userId = req.user?.id || 'admin';
        const mimeType = req.body?.mimeType || 'image/webp';
        const maxFileSize = 5 * 1024 * 1024;
        const presignedResponse = await s3Service.generatePresignedPostUrl('notification_image', userId, mimeType, maxFileSize);
        const fileUrl = s3Service.getFileUrl(presignedResponse.s3Key);
        return sendSuccess(res, {
            uploadUrl: presignedResponse.uploadUrl, fields: presignedResponse.fields,
            s3Key: presignedResponse.s3Key, fileUrl, bucketName: presignedResponse.bucketName,
            region: process.env.AWS_REGION || 'ap-south-2', provider: 's3', maxFileSize, expiresIn: 900,
        });
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to get upload signature', 500);
    }
};

export const uploadNotificationImageViaBackend = async (req: AuthRequest, res: Response) => {
    try {
        const s3Service = getS3Service();
        const userId = req.user?.id || 'admin';
        const { fileBuffer, fileName, mimeType } = req.body || {};
        if (!fileBuffer || !fileName) return sendError(res, 'fileBuffer and fileName are required', 400);
        const buffer = Buffer.from(fileBuffer as string, 'base64');
        const uploadedFile = await s3Service.uploadBuffer(buffer, 'notification_image', userId, fileName, mimeType || 'application/octet-stream');
        return sendSuccess(res, { s3Key: uploadedFile.key, fileUrl: s3Service.getFileUrl(uploadedFile.key), size: uploadedFile.size, mimeType: uploadedFile.mimeType });
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to upload notification image', 500);
    }
};
