import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
    username?: string;
    email?: string;
    phone: string;
    password_hash?: string;
    roles: Array<{
        scope: 'platform' | 'brand' | 'outlet';
        role: string;
        brandId?: mongoose.Types.ObjectId;
        outletId?: mongoose.Types.ObjectId;
    }>;
    is_verified: boolean;
    is_active: boolean;
    last_login_at?: Date;
    currentStep: 'BRAND' | 'OUTLET' | 'COMPLIANCE' | 'DETAILS' | 'SOCIAL' | 'MENU' | 'DONE';
}

const userSchema = new Schema<IUser>({
    username: { type: String, unique: true, sparse: true },
    email: { type: String, sparse: true },
    phone: { type: String, unique: true, required: true },
    password_hash: { type: String },
    roles: [{
        scope: { type: String, enum: ['platform', 'brand', 'outlet'] },
        role: { type: String },
        brandId: { type: Schema.Types.ObjectId, ref: 'Brand' },
        outletId: { type: Schema.Types.ObjectId, ref: 'Outlet' }
    }],
    is_verified: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
    last_login_at: { type: Date },
    currentStep: { type: String, enum: ['BRAND', 'OUTLET', 'COMPLIANCE', 'DETAILS', 'SOCIAL', 'MENU', 'DONE'], default: 'BRAND' }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const User = mongoose.model<IUser>('User', userSchema);
