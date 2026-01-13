import mongoose, { Schema, Document } from 'mongoose';

export interface IFollow extends Document {
    user: mongoose.Types.ObjectId;
    outlet: mongoose.Types.ObjectId;
    created_at: Date;
}

const followSchema = new Schema<IFollow>({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    outlet: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    created_at: { type: Date, default: Date.now }
});

// Indexes for efficient querying
followSchema.index({ user: 1 });
followSchema.index({ outlet: 1 });
// Ensure a user can only follow an outlet once
followSchema.index({ user: 1, outlet: 1 }, { unique: true });

export const Follow = mongoose.model<IFollow>('Follow', followSchema);
