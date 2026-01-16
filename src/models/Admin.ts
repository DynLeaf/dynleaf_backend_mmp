import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IAdmin extends Document {
    email: string;
    password_hash: string;
    full_name: string;
    role: 'super_admin' | 'admin' | 'moderator';
    is_active: boolean;
    permissions: string[];

    last_login_at?: Date;
    last_login_ip?: string;
    last_login_device?: string;

    failed_login_attempts: number;
    locked_until?: Date;

    created_by?: mongoose.Types.ObjectId;
    created_at: Date;
    updated_at: Date;

    // Methods
    comparePassword(candidatePassword: string): Promise<boolean>;
}

const adminSchema = new Schema<IAdmin>({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
    },
    password_hash: {
        type: String,
        required: true
    },
    full_name: {
        type: String,
        required: true,
        trim: true
    },
    role: {
        type: String,
        enum: ['super_admin', 'admin', 'moderator'],
        default: 'admin',
        required: true
    },
    is_active: {
        type: Boolean,
        default: true
    },
    permissions: [{
        type: String
    }],

    last_login_at: { type: Date },
    last_login_ip: { type: String },
    last_login_device: { type: String },

    failed_login_attempts: {
        type: Number,
        default: 0
    },
    locked_until: { type: Date },

    created_by: {
        type: Schema.Types.ObjectId,
        ref: 'Admin'
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

// Indexes
adminSchema.index({ email: 1 });
adminSchema.index({ is_active: 1 });
adminSchema.index({ role: 1 });

// Method to compare passwords
adminSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
    try {
        return await bcrypt.compare(candidatePassword, this.password_hash);
    } catch (error) {
        throw new Error('Password comparison failed');
    }
};

// Pre-save hook to hash password if modified
adminSchema.pre('save', async function () {
    if (!this.isModified('password_hash')) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password_hash = await bcrypt.hash(this.password_hash, salt);
});

export const Admin = mongoose.model<IAdmin>('Admin', adminSchema);
