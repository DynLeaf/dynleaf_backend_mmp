import mongoose, { Document, Schema } from 'mongoose';

export interface ICategory extends Document {
    brand_id: mongoose.Types.ObjectId;
    name: string;
    slug?: string;
    description?: string;
    image_url?: string;
    is_active: boolean;
}

const categorySchema = new Schema<ICategory>({
    brand_id: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
    name: { type: String, required: true },
    slug: { type: String },
    description: { type: String },
    image_url: { type: String },
    is_active: { type: Boolean, default: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const Category = mongoose.model<ICategory>('Category', categorySchema);
