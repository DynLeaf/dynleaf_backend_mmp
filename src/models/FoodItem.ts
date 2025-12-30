import mongoose, { Document, Schema } from 'mongoose';

export interface IFoodItem extends Document {
    brand_id: mongoose.Types.ObjectId;
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
    is_veg: boolean;
    is_active: boolean;
    base_price: number;
    tax_percentage: number;
    
    // Media
    image_url?: string;
    images?: string[]; // Multiple images
    video_url?: string; // Preparation video
    
    addon_ids?: mongoose.Types.ObjectId[];
    tags?: string[];
    order?: number; // Keep for backward compatibility
    preparation_time?: number;
    calories?: number;
    
    // Nutritional info
    nutritional_info?: {
        protein?: number;
        carbs?: number;
        fat?: number;
    };
    
    spice_level?: 'mild' | 'medium' | 'hot' | 'extra_hot';
    allergens?: string[];
    
    // Brand-level engagement (aggregated from outlets)
    total_votes?: number;
    avg_rating?: number;
    total_reviews?: number;
    view_count?: number;
    order_count?: number;
    
    // Brand-level flags
    is_signature?: boolean; // Signature dish
    is_seasonal?: boolean;
    season_start?: Date;
    season_end?: Date;
    is_featured?: boolean; // Keep for backward compatibility
    
    discount_percentage?: number;
}

const foodItemSchema = new Schema<IFoodItem>({
    brand_id: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
    category_id: { type: Schema.Types.ObjectId, ref: 'Category' },
    name: { type: String, required: true },
    slug: { type: String },
    description: { type: String },
    
    // Story elements
    story: { type: String },
    chef_recommendation: { type: String },
    origin_story: { type: String },
    preparation_notes: { type: String },
    
    item_type: { type: String, enum: ['food', 'beverage'], default: 'food', required: true },
    is_veg: { type: Boolean, default: true },
    is_active: { type: Boolean, default: true },
    base_price: { type: Number, required: true },
    tax_percentage: { type: Number, default: 5 },
    
    // Media
    image_url: { type: String },
    images: [{ type: String }],
    video_url: { type: String },
    
    addon_ids: [{ type: Schema.Types.ObjectId, ref: 'AddOn' }],
    tags: [{ type: String }],
    order: { type: Number, default: 0 },
    preparation_time: { type: Number },
    calories: { type: Number },
    
    // Nutritional info
    nutritional_info: {
        protein: { type: Number },
        carbs: { type: Number },
        fat: { type: Number }
    },
    
    spice_level: { type: String, enum: ['mild', 'medium', 'hot', 'extra_hot'] },
    allergens: [{ type: String }],
    
    // Engagement metrics
    total_votes: { type: Number, default: 0 },
    avg_rating: { type: Number, default: 0 },
    total_reviews: { type: Number, default: 0 },
    view_count: { type: Number, default: 0 },
    order_count: { type: Number, default: 0 },
    
    // Flags
    is_signature: { type: Boolean, default: false },
    is_seasonal: { type: Boolean, default: false },
    season_start: { type: Date },
    season_end: { type: Date },
    is_featured: { type: Boolean, default: false },
    
    discount_percentage: { type: Number, default: 0, min: 0, max: 100 }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Indexes
foodItemSchema.index({ brand_id: 1, category_id: 1 });
foodItemSchema.index({ brand_id: 1, is_active: 1 });
foodItemSchema.index({ slug: 1, brand_id: 1 });
foodItemSchema.index({ tags: 1 }); // Multikey index
foodItemSchema.index({ is_signature: 1 });
foodItemSchema.index({ order_count: -1 }); // For trending

export const FoodItem = mongoose.model<IFoodItem>('FoodItem', foodItemSchema);
