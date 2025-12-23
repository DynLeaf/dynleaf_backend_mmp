import mongoose from 'mongoose';

const foodVariantSchema = new mongoose.Schema({
    food_item_id: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem', required: true },
    name: { type: String, required: true },
    price_delta: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true }
}, { timestamps: { createdAt: 'created_at' } });

export const FoodVariant = mongoose.model('FoodVariant', foodVariantSchema);
