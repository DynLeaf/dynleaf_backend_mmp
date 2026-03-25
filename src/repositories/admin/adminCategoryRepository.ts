import { CategoryImage } from '../../models/CategoryImage.js';
import { CategorySlugMap } from '../../models/CategorySlugMap.js';
import { Category } from '../../models/Category.js';

export const findCategoryImages = async () => {
    return await CategoryImage.find().sort({ created_at: -1 }).lean();
};

export const findCategoryImageBySlug = async (slug: string) => {
    return await CategoryImage.findOne({ slug }).lean();
};

export const createCategoryImage = async (name: string, slug: string, imageUrl: string) => {
    return await CategoryImage.create({ name, slug, image_url: imageUrl });
};

export const updateCategoryImage = async (id: string, updates: any) => {
    return await CategoryImage.findByIdAndUpdate(id, updates, { new: true }).lean();
};

export const deleteCategoryImage = async (id: string) => {
    return await CategoryImage.findByIdAndDelete(id).lean();
};

export const upsertCategorySlugMap = async (slug: string, itemKey: string | null) => {
    return await CategorySlugMap.findOneAndUpdate(
        { slug },
        {
            $set: { itemKey },
            $setOnInsert: { slug },
        },
        { upsert: true, new: true }
    ).populate('itemKey', 'name slug image_url').lean();
};

export const nullifySlugMapsByImageId = async (imageId: string) => {
    return await CategorySlugMap.updateMany({ itemKey: imageId }, { $set: { itemKey: null } });
};

export const findCategorySlugMaps = async (query: any) => {
    return await CategorySlugMap.find(query)
        .populate('itemKey', 'name slug image_url')
        .sort({ slug: 1 })
        .lean();
};

export const findCategoriesWithoutImages = async (skip: number, limit: number) => {
    const query = { $or: [{ image_url: { $exists: false } }, { image_url: null }, { image_url: '' }] };
    const [categories, total] = await Promise.all([
        (Category as any)
            .find(query)
            .populate('outlet_id', 'name slug')
            .select('name slug image_url outlet_id')
            .sort({ name: 1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        (Category as any).countDocuments(query),
    ]);
    return { categories, total };
};

export const propagateImageUrlToCategories = async (slug: string, imageUrl: string) => {
    return await (Category as any).updateMany(
        { slug, $or: [{ image_url: { $exists: false } }, { image_url: null }, { image_url: '' }] },
        { $set: { image_url: imageUrl } }
    );
};

export const clearImageUrlFromCategories = async (slug: string) => {
    return await (Category as any).updateMany(
        { slug },
        { $unset: { image_url: '' } }
    );
};

export const findCategoryImageById = async (id: string) => {
    return await CategoryImage.findById(id).lean();
};
