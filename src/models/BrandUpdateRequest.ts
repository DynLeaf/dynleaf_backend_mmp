import mongoose, { Document, Schema } from 'mongoose';

export interface IBrandUpdateRequest extends Document {
    brand_id: mongoose.Types.ObjectId;
    requester_id: mongoose.Types.ObjectId;
    old_data: {
        name: string;
        description?: string;
        logo_url?: string;
        cuisines: string[];
        operating_modes: {
            corporate: boolean;
            franchise: boolean;
        };
        social_media: {
            instagram?: string;
            website?: string;
        };
    };
    new_data: {
        name: string;
        description?: string;
        logo_url?: string;
        cuisines: string[];
        operating_modes: {
            corporate: boolean;
            franchise: boolean;
        };
        social_media: {
            instagram?: string;
            website?: string;
        };
    };
    status: 'pending' | 'approved' | 'rejected';
    reviewed_by?: mongoose.Types.ObjectId;
    reviewed_at?: Date;
    rejection_reason?: string;
}

const brandUpdateRequestSchema = new Schema<IBrandUpdateRequest>({
    brand_id: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
    requester_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    old_data: {
        name: String,
        description: String,
        logo_url: String,
        cuisines: [String],
        operating_modes: {
            corporate: Boolean,
            franchise: Boolean
        },
        social_media: {
            instagram: String,
            website: String
        }
    },
    new_data: {
        name: String,
        description: String,
        logo_url: String,
        cuisines: [String],
        operating_modes: {
            corporate: Boolean,
            franchise: Boolean
        },
        social_media: {
            instagram: String,
            website: String
        }
    },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewed_by: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: { type: Date },
    rejection_reason: { type: String }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const BrandUpdateRequest = mongoose.model<IBrandUpdateRequest>('BrandUpdateRequest', brandUpdateRequestSchema);
