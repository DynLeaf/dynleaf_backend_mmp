import mongoose, { Document, Schema } from 'mongoose';

export interface ICategoryImage extends Document {
    name: string;
    slug: string;
    image_url: string;
}

const categoryImageSchema = new Schema<ICategoryImage>({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    image_url: { type: String, required: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

categoryImageSchema.index({ slug: 1 }, { unique: true });

export const CategoryImage = mongoose.model<ICategoryImage>('CategoryImage', categoryImageSchema);
