import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware.js';
import * as notificationService from '../services/notificationService.js';
import { sendSuccess, sendError } from '../utils/response.js';

export const getMyNotifications = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;

        const data = await notificationService.getUserNotifications(
            userId,
            Number(page),
            Number(limit)
        );

        return sendSuccess(res, data);
    } catch (error: any) {
        console.error('Get notifications error:', error);
        return sendError(res, error.message);
    }
};

export const markRead = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { notificationId } = req.params;

        await notificationService.markAsRead(userId, notificationId);

        return sendSuccess(res, { message: 'Marked as read' });
    } catch (error: any) {
        console.error('Mark read error:', error);
        return sendError(res, error.message);
    }
};

export const markAllRead = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;

        await notificationService.markAsRead(userId);

        return sendSuccess(res, { message: 'All marked as read' });
    } catch (error: any) {
        console.error('Mark all read error:', error);
        return sendError(res, error.message);
    }
};

export const registerPushToken = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { token } = req.body;

        if (!token) {
            return sendError(res, 'Token is required', 400);
        }

        await notificationService.registerPushToken(userId, token);

        return sendSuccess(res, { message: 'Push token registered' });
    } catch (error: any) {
        console.error('Register push token error:', error);
        return sendError(res, error.message);
    }
};
