import mongoose, { Document, Schema } from 'mongoose';

export interface ICategory extends Document {
    outlet_id: mongoose.Types.ObjectId;
    name: string;
    slug?: string;
    description?: string;
    icon_url?: string;
    image_url?: string;
    color?: string;
    display_order?: number;
    is_active: boolean;
    created_by_user_id?: mongoose.Types.ObjectId;
}

const categorySchema = new Schema<ICategory>({
    outlet_id: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String },
    icon_url: { type: String },
    image_url: { type: String },
    color: { type: String },
    display_order: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true },
    created_by_user_id: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Indexes
categorySchema.index({ outlet_id: 1, display_order: 1 });
categorySchema.index({ outlet_id: 1, slug: 1 }, { unique: true });

export const Category = mongoose.model<ICategory>('Category', categorySchema);
