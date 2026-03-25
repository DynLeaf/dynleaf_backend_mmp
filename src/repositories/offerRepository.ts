import { Offer } from '../models/Offer.js';

export interface OfferFilter {
    outlet_ids?: string;
    is_active?: boolean;
}

export interface NearbyOfferQuery {
    latitude: number;
    longitude: number;
    radius: number;
    limit: number;
    search?: string;
}

export const create = async (data: Record<string, unknown>) => {
    const doc = await new Offer(data as ConstructorParameters<typeof Offer>[0]).save();
    return JSON.parse(JSON.stringify(doc.toObject()));
};

export const findByOutlet = async (
    outletId: string,
    filter: Partial<OfferFilter>,
    skip: number,
    limit: number
) => {
    const query: Record<string, unknown> = { outlet_ids: outletId };
    if (filter.is_active !== undefined) query.is_active = filter.is_active;

    const [offers, total] = await Promise.all([
        Offer.find(query as unknown as Parameters<typeof Offer.find>[0]).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
        Offer.countDocuments(query as unknown as Parameters<typeof Offer.countDocuments>[0])
    ]);
    return { offers, total };
};

export const findByIdAndOutlet = async (offerId: string, outletId: string) => {
    return await Offer.findOne({ _id: offerId, outlet_ids: outletId })
        .populate('brand_id', 'name')
        .populate('created_by_user_id', 'username phone')
        .lean();
};

export const findByIdDirect = async (offerId: string) => {
    return await Offer.findOne({ _id: offerId })
        .populate('brand_id', 'name logo_url')
        .populate('outlet_ids', 'name slug location')
        .lean();
};

export const updateById = async (offerId: string, updates: Record<string, unknown>) => {
    return await Offer.findByIdAndUpdate(offerId, updates, { new: true }).lean();
};

export const findOneAndUpdate = async (
    filter: Record<string, unknown>,
    updates: Record<string, unknown>
) => {
    return await Offer.findOneAndUpdate(
        filter as unknown as Parameters<typeof Offer.findOneAndUpdate>[0],
        updates,
        { new: true }
    ).lean();
};

export const deleteByIdAndOutlet = async (offerId: string, outletId: string) => {
    return await Offer.findOneAndDelete({ _id: offerId, outlet_ids: outletId }).lean();
};

export const findByIds = async (ids: string[]) => {
    return await Offer.find({ _id: { $in: ids } })
        .select('title banner_image_url outlet_ids applicable_food_item_ids')
        .lean();
};

export const countByFoodItem = async (outletId: string, foodItemId: string) => {
    return await Offer.countDocuments({
        outlet_ids: outletId,
        applicable_food_item_ids: foodItemId
    });
};

export const distinctFoodItemIds = async (filter: Record<string, unknown>) => {
    return await Offer.distinct('applicable_food_item_ids', filter as unknown as Parameters<typeof Offer.distinct>[1]);
};

export const aggregateNearby = async (query: NearbyOfferQuery) => {
    const now = new Date();
    return await Offer.aggregate([
        {
            $geoNear: {
                near: { type: 'Point', coordinates: [query.longitude, query.latitude] },
                distanceField: 'distance',
                maxDistance: query.radius,
                spherical: true,
                query: {
                    is_active: true,
                    valid_from: { $lte: now },
                    valid_till: { $gte: now },
                    ...(query.search ? { title: { $regex: query.search, $options: 'i' } } : {})
                }
            }
        },
        {
            $lookup: {
                from: 'outlets',
                localField: 'outlet_ids',
                foreignField: '_id',
                as: 'outlet_details'
            }
        },
        {
            $lookup: {
                from: 'brands',
                localField: 'brand_id',
                foreignField: '_id',
                as: 'brand_details'
            }
        },
        { $unwind: { path: '$brand_details', preserveNullAndEmptyArrays: true } },
        { $limit: query.limit },
        {
            $project: {
                _id: 1, title: 1, subtitle: 1, description: 1, offer_type: 1,
                banner_image_url: 1, discount_percentage: 1, discount_amount: 1,
                valid_till: 1, code: 1,
                distance: { $round: ['$distance', 0] },
                outlet: { $arrayElemAt: ['$outlet_details', 0] },
                brand: {
                    _id: '$brand_details._id',
                    name: '$brand_details.name',
                    logo_url: '$brand_details.logo_url'
                }
            }
        }
    ]);
};

export const bulkWrite = async (operations: any[]) => {
    return await Offer.bulkWrite(operations);
};
