import mongoose, { Document, Schema } from 'mongoose';

export interface IOnboardingRequest extends Document {
    user_id: mongoose.Types.ObjectId;
    brand_id: mongoose.Types.ObjectId;
    outlet_id: mongoose.Types.ObjectId;
    status: 'pending_details' | 'pending_approval' | 'approved' | 'rejected';
    menu_strategy: 'brand' | 'outlet';
    submitted_at?: Date;
    reviewed_by?: mongoose.Types.ObjectId;
    reviewed_at?: Date;
    rejection_reason?: string;
    compliance_id?: mongoose.Types.ObjectId;
}

const onboardingRequestSchema = new Schema<IOnboardingRequest>({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    brand_id: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
    outlet_id: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    status: { 
        type: String, 
        enum: ['pending_details', 'pending_approval', 'approved', 'rejected'],
        default: 'pending_details'
    },
    menu_strategy: { 
        type: String, 
        enum: ['brand', 'outlet'],
        required: true 
    },
    submitted_at: { type: Date },
    reviewed_by: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: { type: Date },
    rejection_reason: { type: String },
    compliance_id: { type: Schema.Types.ObjectId, ref: 'Compliance' }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const OnboardingRequest = mongoose.model<IOnboardingRequest>('OnboardingRequest', onboardingRequestSchema);
