import mongoose, { Document, Schema } from 'mongoose';

export interface IMenu extends Document {
    brand_id: mongoose.Types.ObjectId;
    name: string;
    slug?: string;
    is_active: boolean;
    is_default: boolean;
    categories: Array<{
        categoryId: mongoose.Types.ObjectId;
        name: string;
        slug: string;
        order: number;
        items: Array<{
            foodItemId: mongoose.Types.ObjectId;
        }>;
    }>;
}

const menuSchema = new Schema<IMenu>({
    brand_id: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
    name: { type: String, required: true },
    slug: { type: String },
    is_active: { type: Boolean, default: true },
    is_default: { type: Boolean, default: false },
    categories: [{
        categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
        name: String,
        slug: String,
        order: Number,
        items: [{
            foodItemId: { type: Schema.Types.ObjectId, ref: 'FoodItem' }
        }]
    }]
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const Menu = mongoose.model<IMenu>('Menu', menuSchema);
