import mongoose, { Document, Schema } from 'mongoose';

export interface IFoodItem extends Document {
    brand_id: mongoose.Types.ObjectId;
    category_id?: mongoose.Types.ObjectId;
    name: string;
    description?: string;
    is_veg: boolean;
    is_active: boolean;
    base_price: number;
    tax_percentage: number;
    image_url?: string;
    addon_ids?: mongoose.Types.ObjectId[];
    tags?: string[];
    order?: number;
    preparation_time?: number;
    calories?: number;
    spice_level?: 'mild' | 'medium' | 'hot' | 'extra_hot';
    allergens?: string[];
    is_featured?: boolean;
    discount_percentage?: number;
}

const foodItemSchema = new Schema<IFoodItem>({
    brand_id: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
    category_id: { type: Schema.Types.ObjectId, ref: 'Category' },
    name: { type: String, required: true },
    description: { type: String },
    is_veg: { type: Boolean, default: true },
    is_active: { type: Boolean, default: true },
    base_price: { type: Number, required: true },
    tax_percentage: { type: Number, default: 5 },
    image_url: { type: String },
    addon_ids: [{ type: Schema.Types.ObjectId, ref: 'AddOn' }],
    tags: [{ type: String }],
    order: { type: Number, default: 0 },
    preparation_time: { type: Number },
    calories: { type: Number },
    spice_level: { type: String, enum: ['mild', 'medium', 'hot', 'extra_hot'] },
    allergens: [{ type: String }],
    is_featured: { type: Boolean, default: false },
    discount_percentage: { type: Number, default: 0, min: 0, max: 100 }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const FoodItem = mongoose.model<IFoodItem>('FoodItem', foodItemSchema);
