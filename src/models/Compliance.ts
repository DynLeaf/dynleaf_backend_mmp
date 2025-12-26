import mongoose, { Document, Schema } from 'mongoose';

export interface ICompliance extends Document {
    outlet_id: mongoose.Types.ObjectId;
    fssai_number?: string;
    gst_number?: string;
    gst_percentage?: number;
    is_verified: boolean;
    verified_at?: Date;
    verified_by?: mongoose.Types.ObjectId;
    created_at: Date;
    updated_at: Date;
}

const complianceSchema = new Schema<ICompliance>({
    outlet_id: { type: Schema.Types.ObjectId, ref: 'Outlet', unique: true, required: true },
    fssai_number: { 
        type: String, 
        trim: true,
        validate: {
            validator: function(v: string) {
                return !v || /^[0-9]{14}$/.test(v);
            },
            message: 'FSSAI number must be 14 digits'
        }
    },
    gst_number: { 
        type: String, 
        uppercase: true,
        trim: true,
        validate: {
            validator: function(v: string) {
                return !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v);
            },
            message: 'Invalid GST number format'
        }
    },
    gst_percentage: { 
        type: Number,
        min: [0, 'GST percentage cannot be negative'],
        max: [100, 'GST percentage cannot exceed 100']
    },
    is_verified: { type: Boolean, default: false },
    verified_at: { type: Date },
    verified_by: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Indexes
complianceSchema.index({ fssai_number: 1 });
complianceSchema.index({ gst_number: 1 });
complianceSchema.index({ is_verified: 1 });

export const Compliance = mongoose.model<ICompliance>('Compliance', complianceSchema);
