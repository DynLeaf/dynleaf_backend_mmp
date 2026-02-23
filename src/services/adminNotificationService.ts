import { AdminNotification } from '../models/AdminNotification.js';

interface CreateAdminNotificationData {
    title: string;
    message: string;
    type: 'brand' | 'outlet' | 'user';
    referenceId?: string;
}

/**
 * Create a new admin notification entry in the database
 */
export const createAdminNotification = async (data: CreateAdminNotificationData): Promise<void> => {
    try {
        await AdminNotification.create({
            title: data.title,
            message: data.message,
            type: data.type,
            referenceId: data.referenceId || undefined,
            isRead: false,
        });
        console.log(`[AdminNotification] Created: "${data.title}" (type: ${data.type})`);
    } catch (error: any) {
        // Non-fatal — never block the main operation
        console.error('[AdminNotification] Failed to create notification:', error.message);
    }
};

/**
 * Get all admin notifications, newest first, with unread count
 */
export const getAdminNotifications = async () => {
    const [notifications, unreadCount] = await Promise.all([
        AdminNotification.find().sort({ createdAt: -1 }).lean(),
        AdminNotification.countDocuments({ isRead: false }),
    ]);

    return { notifications, unreadCount };
};

/**
 * Get unread notification count only (lightweight ping)
 */
export const getUnreadCount = async (): Promise<number> => {
    return AdminNotification.countDocuments({ isRead: false });
};

/**
 * Mark a single notification as read
 */
export const markAsRead = async (id: string): Promise<boolean> => {
    const result = await AdminNotification.findByIdAndUpdate(
        id,
        { isRead: true },
        { new: true }
    );
    return !!result;
};

/**
 * Mark all notifications as read
 */
export const markAllAsRead = async (): Promise<number> => {
    const result = await AdminNotification.updateMany(
        { isRead: false },
        { isRead: true }
    );
    return result.modifiedCount;
};

/**
 * Delete a single notification by ID
 */
export const deleteNotification = async (id: string): Promise<boolean> => {
    const result = await AdminNotification.findByIdAndDelete(id);
    return !!result;
};

/**
 * Delete all notifications
 */
export const deleteAllNotifications = async (): Promise<number> => {
    const result = await AdminNotification.deleteMany({});
    return result.deletedCount;
};
