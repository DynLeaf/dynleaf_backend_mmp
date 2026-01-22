import mongoose, { Schema, Document } from 'mongoose';

export interface IOTP extends Document {
    phone: string;
    otpHash: string;
    attempts: number;
    createdAt: Date;
}

const OTPSchema: Schema = new Schema({
    phone: { type: String, required: true, index: true },
    otpHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, expires: 300 } // Default 5 mins expiry
});

export default mongoose.model<IOTP>('OTP', OTPSchema);
