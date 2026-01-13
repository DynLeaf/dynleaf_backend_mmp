import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
    user: mongoose.Types.ObjectId;
    title: string;
    message: string;
    type: 'OFFER' | 'SYSTEM' | 'PROMOTION';
    reference_id?: mongoose.Types.ObjectId;
    reference_model?: string;
    is_read: boolean;
    created_at: Date;
}

const notificationSchema = new Schema<INotification>({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['OFFER', 'SYSTEM', 'PROMOTION'], default: 'OFFER' },
    reference_id: { type: Schema.Types.ObjectId },
    reference_model: { type: String },
    is_read: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now }
});

notificationSchema.index({ user: 1, created_at: -1 });
notificationSchema.index({ user: 1, is_read: 1 });
// Automatically delete notifications after 30 days
notificationSchema.index({ created_at: 1 }, { expireAfterSeconds: 2592000 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
