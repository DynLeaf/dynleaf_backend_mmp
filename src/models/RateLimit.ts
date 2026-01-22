import mongoose, { Schema, Document } from 'mongoose';

export interface IRateLimit extends Document {
    key: string;
    count: number;
    createdAt: Date;
}

const RateLimitSchema: Schema = new Schema({
    key: { type: String, required: true, index: true },
    count: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, expires: 3600 } // Default 1 hour window
});

export default mongoose.model<IRateLimit>('RateLimit', RateLimitSchema);
