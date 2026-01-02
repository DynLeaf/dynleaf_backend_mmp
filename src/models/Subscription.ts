import mongoose, { Document, Schema } from 'mongoose';

export interface ISubscription extends Document {
    outlet_id: mongoose.Types.ObjectId;
    brand_id?: mongoose.Types.ObjectId;
    plan: 'free' | 'basic' | 'premium' | 'enterprise';
    status: 'active' | 'inactive' | 'expired' | 'trial' | 'cancelled';
    features: string[];
    start_date: Date;
    end_date?: Date;
    trial_ends_at?: Date;
    assigned_by?: mongoose.Types.ObjectId;
    assigned_at: Date;
    cancelled_at?: Date;
    cancelled_by?: mongoose.Types.ObjectId;
    cancellation_reason?: string;
    payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
    payment_method?: string;
    payment_reference?: string;
    amount?: number;
    currency?: string;
    billing_cycle?: 'monthly' | 'yearly' | 'one-time';
    auto_renew: boolean;
    notes?: string;
    metadata?: Record<string, any>;
}

export interface ISubscriptionHistory extends Document {
    subscription_id: mongoose.Types.ObjectId;
    outlet_id: mongoose.Types.ObjectId;
    action: 'created' | 'upgraded' | 'downgraded' | 'renewed' | 'cancelled' | 'expired' | 'extended' | 'status_changed';
    previous_plan?: string;
    new_plan?: string;
    previous_status?: string;
    new_status?: string;
    changed_by?: mongoose.Types.ObjectId;
    changed_at: Date;
    reason?: string;
    metadata?: Record<string, any>;
}

const subscriptionSchema = new Schema<ISubscription>({
    outlet_id: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    brand_id: { type: Schema.Types.ObjectId, ref: 'Brand' },
    plan: { 
        type: String, 
        enum: ['free', 'basic', 'premium', 'enterprise'], 
        required: true,
        default: 'free'
    },
    status: { 
        type: String, 
        enum: ['active', 'inactive', 'expired', 'trial', 'cancelled'], 
        required: true,
        default: 'inactive'
    },
    features: { 
        type: [String], 
        required: true,
        default: []
    },
    start_date: { 
        type: Date, 
        required: true,
        default: Date.now
    },
    end_date: { type: Date },
    trial_ends_at: { type: Date },
    assigned_by: { 
        type: Schema.Types.ObjectId, 
        ref: 'User'
    },
    assigned_at: { 
        type: Date, 
        required: true,
        default: Date.now
    },
    cancelled_at: { type: Date },
    cancelled_by: { type: Schema.Types.ObjectId, ref: 'User' },
    cancellation_reason: { type: String },
    payment_status: { 
        type: String, 
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    payment_method: { type: String },
    payment_reference: { type: String },
    amount: { type: Number },
    currency: { type: String, default: 'INR' },
    billing_cycle: { 
        type: String, 
        enum: ['monthly', 'yearly', 'one-time']
    },
    auto_renew: { 
        type: Boolean, 
        default: false 
    },
    notes: { type: String },
    metadata: { type: Schema.Types.Mixed }
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

const subscriptionHistorySchema = new Schema<ISubscriptionHistory>({
    subscription_id: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true },
    outlet_id: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    action: { 
        type: String, 
        enum: ['created', 'upgraded', 'downgraded', 'renewed', 'cancelled', 'expired', 'extended', 'status_changed'],
        required: true
    },
    previous_plan: { type: String },
    new_plan: { type: String },
    previous_status: { type: String },
    new_status: { type: String },
    changed_by: { type: Schema.Types.ObjectId, ref: 'User' },
    changed_at: { type: Date, required: true, default: Date.now },
    reason: { type: String },
    metadata: { type: Schema.Types.Mixed }
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

subscriptionSchema.index({ outlet_id: 1 }, { unique: true });
subscriptionSchema.index({ brand_id: 1 });
subscriptionSchema.index({ status: 1, plan: 1 });
subscriptionSchema.index({ end_date: 1, status: 1 });
subscriptionSchema.index({ trial_ends_at: 1, status: 1 });
subscriptionSchema.index({ assigned_by: 1 });
subscriptionSchema.index({ created_at: -1 });

subscriptionHistorySchema.index({ subscription_id: 1, changed_at: -1 });
subscriptionHistorySchema.index({ outlet_id: 1, changed_at: -1 });
subscriptionHistorySchema.index({ action: 1, changed_at: -1 });

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
export const SubscriptionHistory = mongoose.model<ISubscriptionHistory>('SubscriptionHistory', subscriptionHistorySchema);
