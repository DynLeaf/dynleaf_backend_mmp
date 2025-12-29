import mongoose, { Document, Schema } from 'mongoose';

export interface IOutlet extends Document {
    brand_id: mongoose.Types.ObjectId;
    franchise_id?: mongoose.Types.ObjectId;
    created_by_user_id: mongoose.Types.ObjectId;
    name: string;
    slug: string;
    status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'REJECTED' | 'ARCHIVED';
    approval_status: 'PENDING' | 'APPROVED' | 'REJECTED';
    approval?: {
        submitted_at?: Date;
        reviewed_by?: mongoose.Types.ObjectId;
        reviewed_at?: Date;
        rejection_reason?: string;
    };
    media?: {
        cover_image_url?: string;
    };
    opening_hours?: string;
    amenities?: string[];
    photo_gallery?: {
        interior?: string[];
        exterior?: string[];
        food?: string[];
    };
    contact?: {
        phone?: string;
        email?: string;
    };
    address?: {
        full?: string;
        city?: string;
        state?: string;
        country?: string;
        pincode?: string;
    };
    location?: {
        type: string;
        coordinates: [number, number]; // [longitude, latitude]
    };
    price_range?: number; // 1-4 (₹, ₹₹, ₹₹₹, ₹₹₹₹)
    avg_rating?: number;
    total_reviews?: number;
    delivery_time?: number; // in minutes
    is_pure_veg?: boolean;
    timezone?: string;
    restaurant_type?: string;
    vendor_types?: string[];
    seating_capacity?: number;
    table_count?: number;
    managers?: Array<{
        user_id: mongoose.Types.ObjectId;
        role: string;
    }>;
    qr_code_url?: string;
    flags?: {
        is_featured: boolean;
        is_trending: boolean;
    };
    social_media?: {
        instagram?: string;
        whatsapp?: string;
        x?: string;
        website?: string;
        google_review?: string;
    };
}

const outletSchema = new Schema<IOutlet>({
    brand_id: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
    franchise_id: { type: Schema.Types.ObjectId, ref: 'Franchise' },
    created_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    status: { type: String, enum: ['DRAFT', 'ACTIVE', 'INACTIVE', 'REJECTED', 'ARCHIVED'], default: 'DRAFT' },
    approval_status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    approval: {
        submitted_at: Date,
        reviewed_by: { type: Schema.Types.ObjectId, ref: 'User' },
        reviewed_at: Date,
        rejection_reason: String
    },
    media: {
        cover_image_url: String
    },
    opening_hours: String,
    amenities: [String],
    photo_gallery: {
        interior: [String],
        exterior: [String],
        food: [String]
    },
    contact: {
        phone: String,
        email: String
    },
    address: {
        full: String,
        city: String,
        state: String,
        country: String,
        pincode: String
    },
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: {
            type: [Number],
            required: false,
            validate: {
                validator: function(v: number[]) {
                    return !v || (v.length === 2 && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90);
                },
                message: 'Coordinates must be [longitude, latitude] with valid ranges'
            }
        }
    },
    price_range: { type: Number, min: 1, max: 4 },
    avg_rating: { type: Number, min: 0, max: 5, default: 0 },
    total_reviews: { type: Number, default: 0 },
    delivery_time: { type: Number },
    is_pure_veg: { type: Boolean, default: false },
    timezone: { type: String },
    restaurant_type: { type: String },
    vendor_types: [String],
    seating_capacity: Number,
    table_count: Number,
    managers: [{
        user_id: { type: Schema.Types.ObjectId, ref: 'User' },
        role: String
    }],
    qr_code_url: String,
    flags: {
        is_featured: { type: Boolean, default: false },
        is_trending: { type: Boolean, default: false }
    },
    social_media: {
        instagram: String,
        whatsapp: String,
        x: String,
        website: String,
        google_review: String
    }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Create 2dsphere index for geospatial queries
outletSchema.index({ location: '2dsphere' });
outletSchema.index({ 'address.city': 1, 'address.state': 1 });
outletSchema.index({ status: 1, approval_status: 1 });
outletSchema.index({ brand_id: 1, status: 1 });
outletSchema.index({ price_range: 1, avg_rating: -1 });

export const Outlet = mongoose.model<IOutlet>('Outlet', outletSchema);
