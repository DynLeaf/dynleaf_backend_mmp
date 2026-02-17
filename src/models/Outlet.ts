import mongoose, { Document, Schema } from 'mongoose';

export interface IOutlet extends Document {
    brand_id: mongoose.Types.ObjectId;
    franchise_id?: mongoose.Types.ObjectId;
    created_by_user_id: mongoose.Types.ObjectId;
    created_at?: Date;
    updated_at?: Date;
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
    order_phone?: string;
    order_link?: string;
    swiggy_delivery_url?: string;
    zomato_delivery_url?: string;
    reservation_phone?: string;
    reservation_url?: string;
    flags?: {
        is_featured: boolean;
        is_trending: boolean;
        accepts_online_orders: boolean;
        is_open_now: boolean;
    };
    social_media?: {
        instagram?: string;
        facebook?: string;
        twitter?: string;
        whatsapp?: string;
        x?: string;
        website?: string;
        google_review?: string;
    };
    instagram_reels?: Array<{
        id: string;
        url: string;
        title?: string;
        thumbnail?: string;
        added_at: Date;
        is_active: boolean;
        order: number;
    }>;
    subscription_id?: mongoose.Types.ObjectId;
    menu_settings?: {
        default_view_mode: 'grid' | 'list';
        show_item_images: boolean;
        show_category_images: boolean;
        currency: string;
        grid_columns_mobile: number;
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
                validator: function (v: number[]) {
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
    order_phone: String,
    order_link: String,
    swiggy_delivery_url: String,
    zomato_delivery_url: String,
    reservation_phone: String,
    reservation_url: String,
    flags: {
        is_featured: { type: Boolean, default: false },
        is_trending: { type: Boolean, default: false },
        accepts_online_orders: { type: Boolean, default: false },
        is_open_now: { type: Boolean, default: false }
    },
    social_media: {
        instagram: String,
        facebook: String,
        twitter: String,
        whatsapp: String,
        x: String,
        website: String,
        google_review: String
    },
    instagram_reels: [{
        id: { type: String, required: true },
        url: {
            type: String,
            required: true,
            validate: {
                validator: function (v: string) {
                    // Validate Instagram Reel URL format
                    return /^https?:\/\/(www\.)?instagram\.com\/(reel|reels)\/[A-Za-z0-9_-]+\/?(\?.*)?$/.test(v);
                },
                message: 'Invalid Instagram Reel URL format'
            }
        },
        title: { type: String, maxlength: 200 },
        thumbnail: String,
        added_at: { type: Date, default: Date.now },
        is_active: { type: Boolean, default: true },
        order: { type: Number, required: true }
    }],
    subscription_id: { type: Schema.Types.ObjectId, ref: 'Subscription' },
    menu_settings: {
        default_view_mode: { type: String, enum: ['grid', 'list'], default: 'grid' },
        show_item_images: { type: Boolean, default: true },
        show_category_images: { type: Boolean, default: true },
        currency: { type: String, default: 'INR' },
        grid_columns_mobile: { type: Number, min: 1, max: 4, default: 3 }
    }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Create indexes for queries
outletSchema.index({ location: '2dsphere' }); // Single 2dsphere index for geospatial queries
outletSchema.index({ 'address.city': 1, 'address.state': 1 });
outletSchema.index({ status: 1, approval_status: 1 });
outletSchema.index({ brand_id: 1, status: 1, approval_status: 1 });
outletSchema.index({ price_range: 1, avg_rating: -1 });
outletSchema.index({ 'flags.is_featured': 1 }); // Featured outlets (removed duplicate 2dsphere)
outletSchema.index({ created_by_user_id: 1 });
outletSchema.index({ subscription_id: 1 });

export const Outlet = mongoose.model<IOutlet>('Outlet', outletSchema);
