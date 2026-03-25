import * as repo from '../../repositories/brand/brandOutletRepository.js';
import mongoose from 'mongoose';
import {
    buildMallKey,
    extractGroupKeyFromMallKey,
    extractMallName,
    getMallGroupKey,
    normalizeMallName
} from '../../utils/mallKeyUtils.js';

const DEFAULT_FEATURED_LIMIT = 10;
const DEFAULT_FEATURED_RADIUS = 100000;
const DEFAULT_NEARBY_RADIUS = 50000;
const DEFAULT_NEARBY_LIMIT = 20;
const DEFAULT_MALL_NEARBY_RADIUS = 30000;
const DEFAULT_MALL_NEARBY_LIMIT = 20;

const toSlug = (value?: string) => {
    if (!value) return '';
    return value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
};

const calcDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (v: number) => v * (Math.PI / 180);
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

export const getFeaturedBrands = async (params: { lat: number; lng: number; limitNum: number; radiusNum: number }) => {
    const { lat, lng, limitNum, radiusNum } = params;
    const pipeline: mongoose.PipelineStage[] = [
        { $geoNear: { near: { type: 'Point', coordinates: [lng, lat] }, distanceField: 'distance', maxDistance: radiusNum, spherical: true, key: 'location', query: { status: 'ACTIVE', approval_status: 'APPROVED', 'flags.is_featured': true } } },
        { $lookup: { from: 'brands', localField: 'brand_id', foreignField: '_id', as: 'brand' } },
        { $unwind: '$brand' },
        { $match: { 'brand.verification_status': 'approved', 'brand.is_active': true } },
        { $sort: { distance: 1 } }
    ];
    const featuredOutlets = await repo.runOutletAggregate(pipeline) as Array<Record<string, unknown> & { brand: Record<string, unknown>; distance: number }>;
    const brandMap = new Map<string, { brand: object; nearest_outlet: object; total_outlets_nearby: number }>();
    for (const outlet of featuredOutlets) {
        const brandId = (outlet.brand as { _id: { toString(): string } })._id.toString();
        if (!brandMap.has(brandId)) {
            brandMap.set(brandId, { brand: { _id: (outlet.brand as Record<string, unknown>)._id, name: (outlet.brand as Record<string, unknown>).name, slug: (outlet.brand as Record<string, unknown>).slug, logo_url: (outlet.brand as Record<string, unknown>).logo_url, description: (outlet.brand as Record<string, unknown>).description, cuisines: (outlet.brand as Record<string, unknown>).cuisines, is_featured: (outlet.brand as Record<string, unknown>).is_featured }, nearest_outlet: { _id: outlet._id, name: outlet.name, slug: outlet.slug, address: outlet.address, distance: Math.round(outlet.distance), avg_rating: outlet.avg_rating, total_reviews: outlet.total_reviews, price_range: outlet.price_range, delivery_time: outlet.delivery_time, is_pure_veg: outlet.is_pure_veg, media: outlet.media, contact: outlet.contact }, total_outlets_nearby: 1 });
        } else {
            brandMap.get(brandId)!.total_outlets_nearby++;
        }
    }
    return Array.from(brandMap.values()).slice(0, limitNum);
};

export const getNearbyOutlets = async (params: {
    lat: number; lng: number; radiusNum: number; limitNum: number;
    isVeg?: string; minRating?: string; priceRange?: string; cuisines?: string; sortBy?: string; search?: string; userId?: string;
}) => {
    const { lat, lng, radiusNum, limitNum, isVeg, minRating, priceRange, cuisines, sortBy = 'distance', search, userId } = params;
    let outletIdsWithItem: mongoose.Types.ObjectId[] = [];
    if (search) {
        outletIdsWithItem = await repo.getFoodItemDistinct('outlet_id', { name: { $regex: search, $options: 'i' }, is_active: true, is_available: true });
    }
    const matchCriteria: Record<string, unknown> = { status: 'ACTIVE', approval_status: 'APPROVED' };
    if (isVeg === 'true') matchCriteria.is_pure_veg = true;
    if (minRating) matchCriteria.avg_rating = { $gte: parseFloat(minRating) };
    if (priceRange) matchCriteria.price_range = parseInt(priceRange);

    const pipeline: mongoose.PipelineStage[] = [
        { $geoNear: { near: { type: 'Point', coordinates: [lng, lat] }, distanceField: 'distance', maxDistance: radiusNum, spherical: true, key: 'location', query: matchCriteria } },
        { $lookup: { from: 'brands', localField: 'brand_id', foreignField: '_id', as: 'brand' } },
        { $unwind: '$brand' },
        { $match: { 'brand.verification_status': 'approved', 'brand.is_active': true, ...(search ? { $or: [{ name: { $regex: search, $options: 'i' } }, { 'brand.name': { $regex: search, $options: 'i' } }, ...(outletIdsWithItem.length > 0 ? [{ _id: { $in: outletIdsWithItem } }] : [])] } : {}) } }
    ];
    if (userId) {
        const userObjectId = new mongoose.Types.ObjectId(userId);
        pipeline.push({ $lookup: { from: 'follows', let: { outletId: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$outlet', '$$outletId'] }, { $eq: ['$user', userObjectId] }] } } }, { $limit: 1 }], as: 'user_follow' } });
        pipeline.push({ $addFields: { is_following: { $gt: [{ $size: '$user_follow' }, 0] } } });
    }
    if (cuisines) {
        const cuisineArray = cuisines.split(',').map(c => c.trim());
        pipeline.push({ $match: { 'brand.cuisines': { $in: cuisineArray } } });
    }
    pipeline.push({ $lookup: { from: 'outletmenuitems', let: { outletId: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$outlet_id', '$$outletId'] }, { $eq: ['$is_available', true] }] } } }, { $count: 'count' }], as: 'items_count' } });
    pipeline.push({ $addFields: { available_items_count: { $ifNull: [{ $arrayElemAt: ['$items_count.count', 0] }, 0] } } });
    const sortStages: Record<string, object> = { rating: { avg_rating: -1, distance: 1 }, reviews: { total_reviews: -1, distance: 1 }, delivery_time: { delivery_time: 1, distance: 1 } };
    pipeline.push({ $sort: (sortStages[sortBy] || { distance: 1 }) as Record<string, 1 | -1> });
    pipeline.push({ $limit: limitNum });
    pipeline.push({ $project: { _id: 1, name: 1, slug: 1, address: 1, location: 1, distance: { $round: ['$distance', 0] }, avg_rating: 1, total_reviews: 1, price_range: 1, delivery_time: 1, is_pure_veg: 1, media: 1, contact: 1, flags: 1, available_items_count: 1, is_following: 1, brand: { _id: '$brand._id', name: '$brand.name', slug: '$brand.slug', logo_url: '$brand.logo_url', cuisines: '$brand.cuisines' } } });
    return repo.runOutletAggregate(pipeline);
};

export const getOutletDetail = async (outletId: unknown, userId?: string) => {
    const [operatingHours, itemsCount, categories, followersCount, userFollow] = await Promise.all([
        repo.getOperatingHours(outletId),
        repo.countFoodItems(outletId),
        repo.aggregateFoodItems([{ $match: { outlet_id: new mongoose.Types.ObjectId(outletId as string), is_available: true, is_active: true } }, { $lookup: { from: 'categories', localField: 'category_id', foreignField: '_id', as: 'category' } }, { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } }, { $group: { _id: '$category._id', name: { $first: '$category.name' }, slug: { $first: '$category.slug' }, items_count: { $sum: 1 } } }, { $sort: { name: 1 } }]),
        repo.countUserFollow(outletId),
        userId ? repo.findUserFollow(userId, outletId) : null
    ]);
    return { operatingHours: (operatingHours as any[]).map(oh => ({ dayOfWeek: oh.day_of_week, open: oh.open_time, close: oh.close_time, isClosed: oh.is_closed })), itemsCount, categories, followersCount, isFollowing: !!userFollow };
};

export const getNearbyMalls = async (params: { lat: number; lng: number; radiusNum: number; limitNum: number }) => {
    const { lat, lng, radiusNum, limitNum } = params;
    const pipeline: mongoose.PipelineStage[] = [
        { $geoNear: { near: { type: 'Point', coordinates: [lng, lat] }, distanceField: 'distance', maxDistance: radiusNum, spherical: true, key: 'location', query: { status: 'ACTIVE', approval_status: 'APPROVED' } } },
        { $lookup: { from: 'brands', localField: 'brand_id', foreignField: '_id', as: 'brand' } },
        { $unwind: '$brand' },
        { $match: { 'brand.verification_status': 'approved', 'brand.is_active': true } },
        { $project: { _id: 1, name: 1, slug: 1, address: 1, media: 1, avg_rating: 1, total_reviews: 1, distance: 1, brand: { _id: '$brand._id', name: '$brand.name', slug: '$brand.slug', logo_url: '$brand.logo_url' } } }
    ];
    const outlets = await repo.runOutletAggregate(pipeline) as Array<Record<string, unknown>>;
    const mallMap = new Map<string, Record<string, unknown>>();
    for (const outlet of outlets) {
        const address = outlet.address as Record<string, string>;
        const mallName = normalizeMallName(extractMallName(address?.full) || '');
        if (!mallName) continue;
        const key = buildMallKey(mallName, address?.city, address?.state);
        const groupKey = getMallGroupKey(mallName);
        if (!mallMap.has(groupKey)) {
            mallMap.set(groupKey, { key: null, group_key: groupKey, slug: toSlug(mallName), name: mallName, city: address?.city || null, state: address?.state || null, country: address?.country || null, distance: Math.round((outlet.distance as number) || 0), cover_image_url: (outlet.media as Record<string, string>)?.cover_image_url || (outlet.brand as Record<string, string>)?.logo_url || null, outlet_count: 1, key_candidates: new Map([[key, 1]]), outlets_preview: [{ _id: outlet._id, name: outlet.name, slug: outlet.slug, avg_rating: (outlet.avg_rating as number) || 0, total_reviews: (outlet.total_reviews as number) || 0, distance: Math.round((outlet.distance as number) || 0), logo_url: (outlet.brand as Record<string, string>)?.logo_url || (outlet.media as Record<string, string>)?.cover_image_url, brand: outlet.brand }] });
        } else {
            const existing = mallMap.get(groupKey)!;
            existing.outlet_count = (existing.outlet_count as number) + 1;
            const candidates = existing.key_candidates as Map<string, number>;
            candidates.set(key, (candidates.get(key) || 0) + 1);
            existing.distance = Math.min(existing.distance as number, Math.round((outlet.distance as number) || 0));
            const preview = existing.outlets_preview as unknown[];
            if (preview.length < 4) preview.push({ _id: outlet._id, name: outlet.name, slug: outlet.slug, avg_rating: outlet.avg_rating || 0, total_reviews: outlet.total_reviews || 0, distance: Math.round((outlet.distance as number) || 0), logo_url: (outlet.brand as Record<string, string>)?.logo_url || (outlet.media as Record<string, string>)?.cover_image_url, brand: outlet.brand });
        }
    }
    const mallKeys = Array.from(mallMap.values()).flatMap(m => Array.from((m.key_candidates as Map<string, number>).keys()));
    const configs = mallKeys.length ? await repo.getMallQRConfigs(mallKeys) as Array<{ mall_key: string; image?: string }> : [];
    const configMap = new Map(configs.map(c => [c.mall_key, c]));
    const allMalls = Array.from(mallMap.values()).map(mall => {
        const keyCandidates = Array.from((mall.key_candidates as Map<string, number>).entries()).sort((a, b) => b[1] - a[1]);
        const keyWithConfig = keyCandidates.find(([k]) => configMap.has(k))?.[0];
        const selectedKey = keyWithConfig || keyCandidates[0]?.[0] || mall.group_key;
        const config = (keyWithConfig && configMap.get(keyWithConfig)) || configMap.get(selectedKey as string);
        return { key: selectedKey, slug: mall.slug, name: mall.name, city: mall.city, state: mall.state, country: mall.country, distance: mall.distance, cover_image_url: config?.image || mall.cover_image_url, outlet_count: mall.outlet_count, outlets_preview: mall.outlets_preview };
    });
    return allMalls.sort((a, b) => (a.distance as number) - (b.distance as number)).slice(0, limitNum);
};

export const getMallDetail = async (mallKey: string, userLat?: number | null, userLng?: number | null) => {
    const requestedGroupKey = extractGroupKeyFromMallKey(mallKey);
    const outlets = await repo.findActiveApprovedOutlets() as any[];
    const matchedOutlets: Record<string, unknown>[] = [];
    const matchedMallKeys = new Set<string>([mallKey]);
    let mallMeta: Record<string, unknown> | null = null;
    for (const outlet of outlets) {
        const brand = outlet.brand_id as Record<string, unknown>;
        if (!brand || brand.verification_status !== 'approved' || !brand.is_active) continue;
        const address = outlet.address as Record<string, string>;
        const mallName = normalizeMallName(extractMallName(address?.full) || '');
        if (!mallName) continue;
        const outletMallKey = buildMallKey(mallName, address?.city, address?.state);
        const outletGroupKey = getMallGroupKey(mallName);
        if (outletMallKey !== mallKey && outletGroupKey !== requestedGroupKey) continue;
        matchedMallKeys.add(outletMallKey);
        if (!mallMeta) mallMeta = { key: mallKey, slug: toSlug(mallName), name: mallName, city: address?.city || null, state: address?.state || null, country: address?.country || null, cover_image_url: (outlet.media as Record<string, string>)?.cover_image_url || brand.logo_url || null };
        let distance: number | null = null;
        const coords = (outlet.location as { coordinates?: number[] })?.coordinates;
        if (userLat !== null && userLng !== null && Array.isArray(coords) && coords.length === 2) {
            distance = calcDistanceMeters(userLat!, userLng!, coords[1], coords[0]);
        }
        matchedOutlets.push({ _id: outlet._id, name: outlet.name, slug: outlet.slug, address: outlet.address, avg_rating: (outlet.avg_rating as number) || 0, total_reviews: (outlet.total_reviews as number) || 0, distance, cover_image_url: (outlet.media as Record<string, string>)?.cover_image_url || brand.logo_url || null, logo_url: brand.logo_url || (outlet.media as Record<string, string>)?.cover_image_url, brand: { _id: brand._id, name: brand.name, slug: brand.slug, logo_url: brand.logo_url } });
    }
    if (!mallMeta) throw new Error('Mall not found');
    const mallConfigCandidates = await repo.getMallQRConfigs(Array.from(matchedMallKeys)) as Array<{ mall_key: string; image?: string }>;
    const mallConfig = mallConfigCandidates.find(c => c.mall_key === mallKey) || mallConfigCandidates[0];
    if (mallConfig?.image) mallMeta.cover_image_url = mallConfig.image;
    matchedOutlets.sort((a, b) => {
        if (a.distance === null && b.distance === null) return (a.name as string).localeCompare(b.name as string);
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return (a.distance as number) - (b.distance as number);
    });
    return { mall: { ...mallMeta, outlet_count: matchedOutlets.length }, outlets: matchedOutlets };
};

export { DEFAULT_FEATURED_LIMIT, DEFAULT_FEATURED_RADIUS, DEFAULT_NEARBY_RADIUS, DEFAULT_NEARBY_LIMIT, DEFAULT_MALL_NEARBY_RADIUS, DEFAULT_MALL_NEARBY_LIMIT };
