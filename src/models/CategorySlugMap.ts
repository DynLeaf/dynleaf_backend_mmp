import mongoose, { Document, Schema } from 'mongoose';

export interface ICategorySlugMap extends Document {
    slug: string;
    itemKey: mongoose.Types.ObjectId | null;
}

const categorySlugMapSchema = new Schema<ICategorySlugMap>({
    slug: { type: String, required: true, unique: true, lowercase: true },
    itemKey: { type: Schema.Types.ObjectId, ref: 'CategoryImage', default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

categorySlugMapSchema.index({ slug: 1 }, { unique: true });

export const CategorySlugMap = mongoose.model<ICategorySlugMap>('CategorySlugMap', categorySlugMapSchema);
