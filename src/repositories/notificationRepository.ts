import { Notification } from '../models/Notification.js';

export const insertMany = async (notifications: Record<string, unknown>[]) => {
    return await Notification.insertMany(notifications);
};

export const findByUser = async (userId: string) => {
    return await Notification.find({ user: userId })
        .sort({ created_at: -1 })
        .lean();
};

export const countByUser = async (userId: string) => {
    return await Notification.countDocuments({ user: userId });
};

export const markOneRead = async (userId: string, notificationId: string) => {
    return await Notification.findOneAndUpdate(
        { _id: notificationId, user: userId },
        { is_read: true },
        { new: true }
    ).lean();
};

export const markAllRead = async (userId: string) => {
    return await Notification.updateMany(
        { user: userId, is_read: false },
        { is_read: true }
    );
};
