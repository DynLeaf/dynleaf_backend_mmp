import mongoose, { Document, Schema } from 'mongoose';

export interface ISession extends Document {
    user_id: mongoose.Types.ObjectId;
    refresh_token_hash: string;
    device_info: {
        device_id: string;
        device_name?: string;
        device_type: 'mobile' | 'tablet' | 'desktop' | 'unknown';
        os?: string;
        browser?: string;
        ip_address: string;
    };
    is_active: boolean;
    expires_at: Date;
    last_used_at: Date;
    created_at: Date;
    updated_at: Date;
}

const sessionSchema = new Schema<ISession>({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    refresh_token_hash: { type: String, required: true },
    device_info: {
        device_id: { type: String, required: true },
        device_name: { type: String },
        device_type: { type: String, enum: ['mobile', 'tablet', 'desktop', 'unknown'], default: 'unknown' },
        os: { type: String },
        browser: { type: String },
        ip_address: { type: String, required: true }
    },
    is_active: { type: Boolean, default: true },
    expires_at: { type: Date, required: true },
    last_used_at: { type: Date, default: Date.now }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

sessionSchema.index({ user_id: 1, is_active: 1 });
sessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ 'device_info.device_id': 1 });

export const Session = mongoose.model<ISession>('Session', sessionSchema);
