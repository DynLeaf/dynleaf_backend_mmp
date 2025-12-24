import mongoose, { Document, Schema } from 'mongoose';

export interface IOTP extends Document {
    phone: string;
    otp_hash: string;
    attempts: number;
    expires_at: Date;
    verified: boolean;
}

const otpSchema = new Schema<IOTP>({
    phone: { type: String, required: true, index: true },
    otp_hash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expires_at: { type: Date, required: true, index: true },
    verified: { type: Boolean, default: false }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

otpSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const OTP = mongoose.model<IOTP>('OTP', otpSchema);
