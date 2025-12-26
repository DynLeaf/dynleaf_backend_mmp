import mongoose, { Document, Schema } from 'mongoose';

export interface IOnboardingSession extends Document {
    user_id: mongoose.Types.ObjectId;
    status: 'draft' | 'submitted' | 'approved' | 'rejected';
    current_step: number;
    brand_id?: mongoose.Types.ObjectId;
    outlet_id?: mongoose.Types.ObjectId;
    step_data: Record<string, any>;
    submitted_at?: Date;
    reviewed_by?: mongoose.Types.ObjectId;
    reviewed_at?: Date;
    rejection_reason?: string;
    created_at: Date;
    updated_at: Date;
}

const onboardingSessionSchema = new Schema<IOnboardingSession>({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { 
        type: String, 
        enum: ['draft', 'submitted', 'approved', 'rejected'], 
        default: 'draft' 
    },
    current_step: { type: Number, default: 1, min: 1, max: 6 },
    brand_id: { type: Schema.Types.ObjectId, ref: 'Brand' },
    outlet_id: { type: Schema.Types.ObjectId, ref: 'Outlet' },
    step_data: { type: Schema.Types.Mixed, default: {} },
    submitted_at: { type: Date },
    reviewed_by: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: { type: Date },
    rejection_reason: { type: String }
}, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } 
});

// Indexes for performance
onboardingSessionSchema.index({ user_id: 1, status: 1 });
onboardingSessionSchema.index({ status: 1, submitted_at: -1 });
onboardingSessionSchema.index({ created_at: -1 });

export const OnboardingSession = mongoose.model<IOnboardingSession>('OnboardingSession', onboardingSessionSchema);
