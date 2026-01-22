import mongoose, { Document, Schema } from 'mongoose';

export interface IAddOn extends Document {
    outlet_id: mongoose.Types.ObjectId;
    name: string;
    price: number;
    category?: string;
    display_order?: number;
    is_active: boolean;
}

const addOnSchema = new Schema<IAddOn>({
    outlet_id: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true, index: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String },
    display_order: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const AddOn = mongoose.model<IAddOn>('AddOn', addOnSchema);
