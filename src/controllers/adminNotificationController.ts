import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response.js';
import * as adminNotificationService from '../services/adminNotificationService.js';
import mongoose from 'mongoose';

/**
 * GET /api/admin/notifications
 * Returns all notifications + unread count
 */
export const getNotifications = async (req: Request, res: Response) => {
    try {
        const data = await adminNotificationService.getAdminNotifications();
        return sendSuccess(res, data);
    } catch (error: any) {
        console.error('[AdminNotificationController] getNotifications error:', error.message);
        return sendError(res, error.message);
    }
};

/**
 * PATCH /api/admin/notifications/read-all
 * Marks all notifications as read
 */
export const markAllRead = async (req: Request, res: Response) => {
    try {
        const count = await adminNotificationService.markAllAsRead();
        return sendSuccess(res, { updatedCount: count }, 'All notifications marked as read');
    } catch (error: any) {
        console.error('[AdminNotificationController] markAllRead error:', error.message);
        return sendError(res, error.message);
    }
};

/**
 * PATCH /api/admin/notifications/:id/read
 * Marks a single notification as read
 */
export const markOneRead = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendError(res, 'Invalid notification ID', null, 400);
        }

        const found = await adminNotificationService.markAsRead(id);
        if (!found) {
            return sendError(res, 'Notification not found', null, 404);
        }

        return sendSuccess(res, null, 'Notification marked as read');
    } catch (error: any) {
        console.error('[AdminNotificationController] markOneRead error:', error.message);
        return sendError(res, error.message);
    }
};

/**
 * DELETE /api/admin/notifications/:id
 * Deletes a single notification
 */
export const deleteOne = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendError(res, 'Invalid notification ID', null, 400);
        }

        const found = await adminNotificationService.deleteNotification(id);
        if (!found) {
            return sendError(res, 'Notification not found', null, 404);
        }

        return sendSuccess(res, null, 'Notification deleted');
    } catch (error: any) {
        console.error('[AdminNotificationController] deleteOne error:', error.message);
        return sendError(res, error.message);
    }
};

/**
 * DELETE /api/admin/notifications
 * Deletes all notifications
 */
export const deleteAll = async (req: Request, res: Response) => {
    try {
        const count = await adminNotificationService.deleteAllNotifications();
        return sendSuccess(res, { deletedCount: count }, 'All notifications cleared');
    } catch (error: any) {
        console.error('[AdminNotificationController] deleteAll error:', error.message);
        return sendError(res, error.message);
    }
};
