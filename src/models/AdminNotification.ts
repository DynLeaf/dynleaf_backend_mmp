import mongoose, { Schema, Document } from 'mongoose';

export interface IAdminNotification extends Document {
    title: string;
    message: string;
    type: 'brand' | 'outlet' | 'user';
    referenceId?: mongoose.Types.ObjectId;
    isRead: boolean;
    createdAt: Date;
}

const adminNotificationSchema = new Schema<IAdminNotification>({
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
        type: String,
        enum: ['brand', 'outlet', 'user'],
        required: true,
    },
    referenceId: { type: Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

// Index for fast unread count queries
adminNotificationSchema.index({ isRead: 1, createdAt: -1 });

// Auto-delete after 90 days
adminNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

export const AdminNotification = mongoose.model<IAdminNotification>(
    'AdminNotification',
    adminNotificationSchema
);
