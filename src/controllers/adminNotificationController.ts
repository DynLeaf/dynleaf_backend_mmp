import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response.js';
import * as adminNotificationService from '../services/adminNotificationService.js';

export const getNotifications = async (req: Request, res: Response) => {
    try {
        const data = await adminNotificationService.getAdminNotifications();
        return sendSuccess(res, data);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message, null, err.statusCode ?? 500);
    }
};

export const markAllRead = async (req: Request, res: Response) => {
    try {
        const count = await adminNotificationService.markAllAsRead();
        return sendSuccess(res, { updatedCount: count }, 'All notifications marked as read');
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message, null, err.statusCode ?? 500);
    }
};

export const markOneRead = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const found = await adminNotificationService.markAsRead(id);
        if (!found) return sendError(res, 'Notification not found', null, 404);
        return sendSuccess(res, null, 'Notification marked as read');
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message, null, err.statusCode ?? 500);
    }
};

export const deleteOne = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const found = await adminNotificationService.deleteNotification(id);
        if (!found) return sendError(res, 'Notification not found', null, 404);
        return sendSuccess(res, null, 'Notification deleted');
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message, null, err.statusCode ?? 500);
    }
};

export const deleteAll = async (req: Request, res: Response) => {
    try {
        const count = await adminNotificationService.deleteAllNotifications();
        return sendSuccess(res, { deletedCount: count }, 'All notifications cleared');
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message, null, err.statusCode ?? 500);
    }
};
