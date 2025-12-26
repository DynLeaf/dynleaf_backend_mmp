import mongoose, { Document, Schema } from 'mongoose';

export interface IAddOn extends Document {
    brand_id: mongoose.Types.ObjectId;
    name: string;
    price: number;
    category?: string;
    is_active: boolean;
}

const addOnSchema = new Schema<IAddOn>({
    brand_id: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String },
    is_active: { type: Boolean, default: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const AddOn = mongoose.model<IAddOn>('AddOn', addOnSchema);
