import mongoose, { Document, Schema } from 'mongoose';

export interface IBrand extends Document {
    name: string;
    slug: string;
    logo_url?: string;
    description?: string;
    cuisines: string[];
    operating_modes: {
        corporate: boolean;
        franchise: boolean;
    };
    social_media: {
        instagram?: string;
        whatsapp?: string;
        x?: string;
        website?: string;
        google_review?: string;
    };
    verification_status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    verified_by?: mongoose.Types.ObjectId;
    verified_at?: Date;
    admin_user_id: mongoose.Types.ObjectId;
    is_featured: boolean;
    is_active: boolean;
}

const brandSchema = new Schema<IBrand>({
    name: { type: String, required: true },
    slug: { type: String, unique: true },
    logo_url: { type: String },
    description: { type: String },
    cuisines: [String],
    operating_modes: {
        corporate: { type: Boolean, default: true },
        franchise: { type: Boolean, default: false }
    },
    social_media: {
        instagram: String,
        whatsapp: String,
        x: String,
        website: String,
        google_review: String
    },
    verification_status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' },
    verified_by: { type: Schema.Types.ObjectId, ref: 'User' },
    verified_at: { type: Date },
    admin_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    is_featured: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const Brand = mongoose.model<IBrand>('Brand', brandSchema);
