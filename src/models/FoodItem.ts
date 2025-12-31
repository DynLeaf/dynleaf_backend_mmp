import mongoose, { Document, Schema } from 'mongoose';

export interface IFoodItem extends Document {
    outlet_id: mongoose.Types.ObjectId;
    category_id?: mongoose.Types.ObjectId;
    name: string;
    slug?: string;
    description?: string;
    
    // Dynleaf "story" elements
    story?: string; // Why this dish is special
    chef_recommendation?: string; // Chef's notes
    origin_story?: string; // History of the dish
    preparation_notes?: string; // How it's made
    
    item_type: 'food' | 'beverage';
    food_type: 'veg' | 'non-veg' | 'egg' | 'vegan';
    is_veg: boolean;
    is_available: boolean;
    is_active: boolean;
    price: number;
    original_price?: number;
    tax_percentage: number;
    
    // Media
    image_url?: string;
    images?: string[]; // Multiple images
    video_url?: string; // Preparation video
    
    // Geospatial (copied from outlet for fast geo queries)
    location?: {
        type: string;
        coordinates: number[];
    };
    
    // Additional fields
    cuisines?: string[];
    tags?: string[];
    addon_ids?: mongoose.Types.ObjectId[];
    order?: number;
    display_order?: number;
    preparation_time?: number;
    serves?: number;
    calories?: number;
    
    // Nutritional info
    nutritional_info?: {
        protein?: number;
        carbs?: number;
        fat?: number;
    };
    
    spice_level?: 'mild' | 'medium' | 'hot' | 'extra_hot';
    allergens?: string[];
    ingredients?: string[];
    
    // Stock management
    stock_status?: 'in_stock' | 'low_stock' | 'out_of_stock';
    stock_quantity?: number;
    
    // Time-based availability
    availability_schedule?: {
        is_time_restricted: boolean;
        available_from?: string;
        available_until?: string;
        available_days?: number[];
    };
    
    // Outlet-level engagement metrics
    total_votes?: number; // Legacy or total interaction count
    upvote_count?: number; // Displayed count
    downvote_count?: number; // Analytics only
    avg_rating?: number;
    total_reviews?: number;
    view_count?: number;
    order_count?: number;
    save_count?: number;
    
    // Outlet-level flags
    is_signature?: boolean;
    is_bestseller?: boolean;
    is_new?: boolean;
    is_featured?: boolean;
    is_seasonal?: boolean;
    season_start?: Date;
    season_end?: Date;
    
    discount_percentage?: number;
    
    created_by_user_id?: mongoose.Types.ObjectId;
}

const foodItemSchema = new Schema<IFoodItem>({
    outlet_id: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true, index: true },
    category_id: { type: Schema.Types.ObjectId, ref: 'Category' },
    name: { type: String, required: true, trim: true },
    slug: { type: String },
    description: { type: String },
    
    // Story elements
    story: { type: String },
    chef_recommendation: { type: String },
    origin_story: { type: String },
    preparation_notes: { type: String },
    
    item_type: { type: String, enum: ['food', 'beverage'], default: 'food', required: true },
    food_type: { type: String, enum: ['veg', 'non-veg', 'egg', 'vegan'], required: true },
    is_veg: { type: Boolean, default: true },
    is_available: { type: Boolean, default: true },
    is_active: { type: Boolean, default: true },
    price: { type: Number, required: true, min: 0 },
    original_price: { type: Number },
    tax_percentage: { type: Number, default: 5 },
    
    // Media
    image_url: { type: String },
    images: [{ type: String }],
    video_url: { type: String },
    
    // Geospatial
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: false }
    },
    
    // Additional fields
    cuisines: [{ type: String }],
    tags: [{ type: String }],
    addon_ids: [{ type: Schema.Types.ObjectId, ref: 'AddOn' }],
    order: { type: Number, default: 0 },
    display_order: { type: Number, default: 0 },
    preparation_time: { type: Number },
    serves: { type: Number },
    calories: { type: Number },
    
    // Nutritional info
    nutritional_info: {
        protein: { type: Number },
        carbs: { type: Number },
        fat: { type: Number }
    },
    
    spice_level: { type: String, enum: ['mild', 'medium', 'hot', 'extra_hot'] },
    allergens: [{ type: String }],
    ingredients: [{ type: String }],
    
    // Stock management
    stock_status: { type: String, enum: ['in_stock', 'low_stock', 'out_of_stock'], default: 'in_stock' },
    stock_quantity: { type: Number },
    
    // Time-based availability
    availability_schedule: {
        is_time_restricted: { type: Boolean, default: false },
        available_from: { type: String },
        available_until: { type: String },
        available_days: [{ type: Number }]
    },
    
    // Engagement metrics
    total_votes: { type: Number, default: 0 },
    upvote_count: { type: Number, default: 0 },
    downvote_count: { type: Number, default: 0 },
    avg_rating: { type: Number, default: 0 },
    total_reviews: { type: Number, default: 0 },
    view_count: { type: Number, default: 0 },
    order_count: { type: Number, default: 0 },
    save_count: { type: Number, default: 0 },
    
    // Flags
    is_signature: { type: Boolean, default: false },
    is_bestseller: { type: Boolean, default: false },
    is_new: { type: Boolean, default: false },
    is_featured: { type: Boolean, default: false },
    is_seasonal: { type: Boolean, default: false },
    season_start: { type: Date },
    season_end: { type: Date },
    
    discount_percentage: { type: Number, default: 0, min: 0, max: 100 },
    
    created_by_user_id: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Indexes for performance
foodItemSchema.index({ outlet_id: 1, is_available: 1 });
foodItemSchema.index({ outlet_id: 1, category_id: 1 });
foodItemSchema.index({ outlet_id: 1, category_id: 1, display_order: 1 });
foodItemSchema.index({ location: '2dsphere' });
foodItemSchema.index({ name: 'text', description: 'text', tags: 'text' });
foodItemSchema.index({ cuisines: 1 });
foodItemSchema.index({ food_type: 1 });
foodItemSchema.index({ avg_rating: -1 });
foodItemSchema.index({ order_count: -1 });
foodItemSchema.index({ outlet_id: 1, is_featured: 1, avg_rating: -1 });

export const FoodItem = mongoose.model<IFoodItem>('FoodItem', foodItemSchema);
