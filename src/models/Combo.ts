import mongoose, { Document, Schema } from 'mongoose';

export interface IComboItem {
    food_item_id: mongoose.Types.ObjectId;
    quantity: number;
}

export interface ICombo extends Document {
    outlet_id: mongoose.Types.ObjectId;
    name: string;
    description?: string;
    image_url?: string;
    items: IComboItem[];
    discount_percentage: number;
    original_price: number;
    price: number;
    manual_price_override: boolean;
    display_order?: number;
    is_active: boolean;
}

const comboItemSchema = new Schema<IComboItem>({
    food_item_id: { type: Schema.Types.ObjectId, ref: 'FoodItem', required: true },
    quantity: { type: Number, required: true, min: 1 }
}, { _id: false });

const comboSchema = new Schema<ICombo>({
    outlet_id: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    image_url: { type: String },
    items: { type: [comboItemSchema], default: [] },
    discount_percentage: { type: Number, default: 0, min: 0, max: 100 },
    original_price: { type: Number, default: 0, min: 0 },
    price: { type: Number, default: 0, min: 0 },
    manual_price_override: { type: Boolean, default: false },
    display_order: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const Combo = mongoose.model<ICombo>('Combo', comboSchema);
