import { FeaturedPromotion } from '../models/FeaturedPromotion.js';

export const create = async (data: Record<string, unknown>) => {
    const doc = await new FeaturedPromotion(data as ConstructorParameters<typeof FeaturedPromotion>[0]).save();
    return JSON.parse(JSON.stringify(doc.toObject()));
};

export const findById = async (id: string) => {
    return await FeaturedPromotion.findById(id)
        .populate('outlet_id', 'name slug logo_url address contact')
        .populate('created_by', 'username email')
        .lean();
};

export const findByIds = async (ids: string[]) => {
    return await FeaturedPromotion.find({ _id: { $in: ids } }).lean();
};

export const findByIdPopulated = async (id: string) => {
    return await FeaturedPromotion.findById(id)
        .populate('outlet_id', 'name slug logo_url address')
        .populate('created_by', 'username email')
        .lean();
};

export const findByIdRaw = async (id: string) => {
    return await FeaturedPromotion.findById(id);
};

export const findWithFilters = async (
    query: Record<string, unknown>,
    skip: number,
    limit: number
) => {
    const [promotions, total] = await Promise.all([
        FeaturedPromotion.find(query)
            .populate('outlet_id', 'name slug logo_url address')
            .populate('created_by', 'username email')
            .sort({ 'scheduling.display_priority': -1, created_at: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        FeaturedPromotion.countDocuments(query)
    ]);
    return { promotions, total };
};

export const updateById = async (id: string, updates: Record<string, unknown>) => {
    return await FeaturedPromotion.findByIdAndUpdate(id, updates, { new: true }).lean();
};

export const deleteById = async (id: string) => {
    return await FeaturedPromotion.findByIdAndDelete(id).lean();
};

export const incrementAnalytics = async (id: string, field: string) => {
    return await FeaturedPromotion.findByIdAndUpdate(
        id,
        { $inc: { [`analytics.${field}`]: 1 } },
        { new: true }
    ).lean();
};

export const findFeaturedActive = async (
    query: Record<string, unknown>,
    limit: number
) => {
    return await FeaturedPromotion.find(query)
        .populate({
            path: 'outlet_id',
            select: 'name slug logo_url address location cuisines price_range avg_rating is_pure_veg',
            populate: { path: 'brand_id', select: 'name logo_url' }
        })
        .sort({ 'scheduling.display_priority': -1 })
        .limit(limit)
        .lean();
};

export const bulkWrite = async (operations: any[]) => {
    return await FeaturedPromotion.bulkWrite(operations);
};
