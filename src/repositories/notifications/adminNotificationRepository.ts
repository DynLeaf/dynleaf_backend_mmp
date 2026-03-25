import { AdminNotification } from '../../models/AdminNotification.js';

export const adminNotificationRepository = {
    create: async (data: { title: string; message: string; type: string; referenceId?: string; isRead: boolean }) => {
        return await AdminNotification.create(data);
    },
    
    findAllSorted: async () => {
        return await AdminNotification.find().sort({ createdAt: -1 }).lean();
    },
    
    countUnread: async () => {
        return await AdminNotification.countDocuments({ isRead: false });
    },
    
    markAsRead: async (id: string) => {
        return await AdminNotification.findByIdAndUpdate(id, { isRead: true }, { new: true });
    },
    
    markAllAsRead: async () => {
        return await AdminNotification.updateMany({ isRead: false }, { isRead: true });
    },
    
    deleteById: async (id: string) => {
        return await AdminNotification.findByIdAndDelete(id);
    },
    
    deleteAll: async () => {
        return await AdminNotification.deleteMany({});
    }
};
