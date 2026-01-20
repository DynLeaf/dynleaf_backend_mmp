import mongoose, { Document, Schema } from 'mongoose';

export interface IBrandMember extends Document {
    brand_id: mongoose.Types.ObjectId;
    user_id: mongoose.Types.ObjectId;
    role: 'brand_owner' | 'brand_manager' | 'outlet_manager';
    permissions: {
        can_sync_menu: boolean;
        can_manage_outlets: boolean;
        can_manage_members: boolean;
    };
    assigned_outlets?: mongoose.Types.ObjectId[]; // For outlet_manager role
    created_at?: Date;
    updated_at?: Date;
}

const brandMemberSchema = new Schema<IBrandMember>({
    brand_id: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
        type: String,
        enum: ['brand_owner', 'brand_manager', 'outlet_manager'],
        required: true
    },
    permissions: {
        can_sync_menu: { type: Boolean, default: false },
        can_manage_outlets: { type: Boolean, default: false },
        can_manage_members: { type: Boolean, default: false }
    },
    assigned_outlets: [{ type: Schema.Types.ObjectId, ref: 'Outlet' }]
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Create indexes for performance
brandMemberSchema.index({ brand_id: 1, user_id: 1 }, { unique: true });
brandMemberSchema.index({ user_id: 1 });
brandMemberSchema.index({ brand_id: 1, role: 1 });

export const BrandMember = mongoose.model<IBrandMember>('BrandMember', brandMemberSchema);
