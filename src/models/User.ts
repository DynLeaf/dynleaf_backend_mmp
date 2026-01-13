import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
    username?: string;
    full_name?: string;
    email?: string;
    phone: string;
    password_hash?: string;
    google_id?: string;
    avatar_url?: string;
    bio?: string;

    roles: Array<{
        scope: 'platform' | 'brand' | 'outlet';
        role: 'customer' | 'restaurant_owner' | 'admin' | 'manager' | 'staff';
        brandId?: mongoose.Types.ObjectId;
        outletId?: mongoose.Types.ObjectId;
        permissions?: string[];
        assignedAt: Date;
        assignedBy?: mongoose.Types.ObjectId;
    }>;

    is_verified: boolean;
    is_active: boolean;
    is_suspended: boolean;
    suspension_reason?: string;
    suspended_at?: Date;
    suspended_by?: mongoose.Types.ObjectId;

    currentStep: 'BRAND' | 'OUTLET' | 'COMPLIANCE' | 'DETAILS' | 'SOCIAL' | 'MENU' | 'PENDING_APPROVAL' | 'DONE';
    onboarding_completed_at?: Date;

    last_login_at?: Date;
    last_active_at?: Date;
    last_login_ip?: string;
    last_login_device?: string;

    failed_login_attempts: number;
    locked_until?: Date;

    preferred_role?: string;
    notification_preferences?: {
        email: boolean;
        sms: boolean;
        push: boolean;
    };
    fcm_tokens?: string[];
}

const userSchema = new Schema<IUser>({
    username: { type: String, unique: true, sparse: true },
    full_name: { type: String },
    email: { type: String, sparse: true },
    phone: { type: String, unique: true, required: true },
    password_hash: { type: String },
    google_id: { type: String, unique: true, sparse: true },
    avatar_url: { type: String },
    bio: { type: String, maxlength: 500 },

    roles: [{
        scope: { type: String, enum: ['platform', 'brand', 'outlet'], required: true },
        role: { type: String, enum: ['customer', 'restaurant_owner', 'admin', 'manager', 'staff'], required: true },
        brandId: { type: Schema.Types.ObjectId, ref: 'Brand' },
        outletId: { type: Schema.Types.ObjectId, ref: 'Outlet' },
        permissions: [{ type: String }],
        assignedAt: { type: Date, default: Date.now },
        assignedBy: { type: Schema.Types.ObjectId, ref: 'User' }
    }],

    is_verified: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
    is_suspended: { type: Boolean, default: false },
    suspension_reason: { type: String },
    suspended_at: { type: Date },
    suspended_by: { type: Schema.Types.ObjectId, ref: 'User' },

    currentStep: { type: String, enum: ['BRAND', 'OUTLET', 'COMPLIANCE', 'DETAILS', 'SOCIAL', 'MENU', 'PENDING_APPROVAL', 'DONE'], default: 'BRAND' },
    onboarding_completed_at: { type: Date },

    last_login_at: { type: Date },
    last_active_at: { type: Date },
    last_login_ip: { type: String },
    last_login_device: { type: String },

    failed_login_attempts: { type: Number, default: 0 },
    locked_until: { type: Date },

    preferred_role: { type: String },
    notification_preferences: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
        push: { type: Boolean, default: true }
    },
    fcm_tokens: [{ type: String }]
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Indexes - phone and email already have indexes from unique: true in schema
userSchema.index({ 'roles.brandId': 1 });
userSchema.index({ 'roles.outletId': 1 });
userSchema.index({ is_active: 1, is_suspended: 1 });
userSchema.index({ fcm_tokens: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
