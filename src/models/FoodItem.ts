import mongoose, { Document, Schema } from 'mongoose';

export interface IFoodItem extends Document {
    brand_id: mongoose.Types.ObjectId;
    name: string;
    description?: string;
    is_veg: boolean;
    is_active: boolean;
    base_price: number;
    tax_percentage: number;
    image_url?: string;
}

const foodItemSchema = new Schema<IFoodItem>({
    brand_id: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
    name: { type: String, required: true },
    description: { type: String },
    is_veg: { type: Boolean, default: true },
    is_active: { type: Boolean, default: true },
    base_price: { type: Number, required: true },
    tax_percentage: { type: Number, default: 5 },
    image_url: { type: String }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const FoodItem = mongoose.model<IFoodItem>('FoodItem', foodItemSchema);
