import { Request, Response } from 'express';
console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
console.log('!!! BRAND_OUTLET_CONTROLLER LOADING - JAN-24-16-25 !!!');
console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
import { Outlet } from '../models/Outlet.js';
import { FoodItem } from '../models/FoodItem.js';
import { Category } from '../models/Category.js';
import { OperatingHours } from '../models/OperatingHours.js';
import { Follow } from '../models/Follow.js';
import mongoose from 'mongoose';
import * as outletService from '../services/outletService.js';
import { sendSuccess, sendError, ErrorCode } from '../utils/response.js';

// Constants
const DEFAULT_FEATURED_LIMIT = 10;
const DEFAULT_FEATURED_RADIUS = 100000;
const DEFAULT_NEARBY_RADIUS = 50000;
const DEFAULT_NEARBY_LIMIT = 20;
const DEFAULT_MALL_NEARBY_RADIUS = 30000;
const DEFAULT_MALL_NEARBY_LIMIT = 20;
const STATUS_CODE_BAD_REQUEST = 400;
const STATUS_CODE_NOT_FOUND = 404;
const STATUS_CODE_SERVER_ERROR = 500;

const toSlug = (value?: string) => {
  if (!value) return '';
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

const toTitleCase = (value?: string) => {
  if (!value) return '';
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const extractMallName = (addressFull?: string) => {
  if (!addressFull) return null;

  const normalized = addressFull.replace(/\s+/g, ' ').trim();
  const segmentPatterns = [
    /([^,]*\b(?:mall|food\s*court)\b[^,]*)/i,
    /([^|]*\b(?:mall|food\s*court)\b[^|]*)/i,
    /(\b(?:mall|food\s*court)\b.*)$/i
  ];

  for (const pattern of segmentPatterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate && candidate.length >= 3) {
      return toTitleCase(candidate);
    }
  }

  return null;
};

const buildMallKey = (mallName: string, city?: string, state?: string) => {
  const mallSlug = toSlug(mallName);
  const citySlug = toSlug(city) || 'unknown-city';
  const stateSlug = toSlug(state) || 'unknown-state';
  return `${mallSlug}-${citySlug}-${stateSlug}`;
};

const calcDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) => {
  const toRad = (value: number) => value * (Math.PI / 180);
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadius * c);
};

/**
 * NEW: Get featured brands with their nearest outlet
 * Returns unique brands (deduplicated) with nearest outlet details
 * 
 * GET /api/v1/brands/featured
 */
export const getFeaturedBrands = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude, limit = DEFAULT_FEATURED_LIMIT, radius = DEFAULT_FEATURED_RADIUS } = req.query;

    if (!latitude || !longitude) {
      return sendError(res, 'Latitude and longitude are required', ErrorCode.VALIDATION_ERROR, STATUS_CODE_BAD_REQUEST);
    }

    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);
    const radiusNum = parseInt(radius as string);
    const limitNum = parseInt(limit as string);

    console.log(`🌟 Finding featured brands near [${lat}, ${lng}]`);

    // Step 1: Find featured outlets nearby using geospatial query
    const featuredOutlets = await Outlet.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          distanceField: 'distance',
          maxDistance: radiusNum,
          spherical: true,
          key: 'location',
          query: {
            status: 'ACTIVE',
            approval_status: 'APPROVED',
            'flags.is_featured': true
          }
        }
      },
      {
        $lookup: {
          from: 'brands',
          localField: 'brand_id',
          foreignField: '_id',
          as: 'brand'
        }
      },
      { $unwind: '$brand' },
      {
        $match: {
          'brand.verification_status': 'approved',
          'brand.is_active': true
        }
      },
      { $sort: { distance: 1 } }
    ]);

    console.log(`📍 Found ${featuredOutlets.length} featured outlets`);

    // Step 2: Deduplicate by brand (keep nearest outlet per brand)
    const brandMap = new Map();

    for (const outlet of featuredOutlets) {
      const brandId = outlet.brand._id.toString();

      if (!brandMap.has(brandId)) {
        brandMap.set(brandId, {
          brand: {
            _id: outlet.brand._id,
            name: outlet.brand.name,
            slug: outlet.brand.slug,
            logo_url: outlet.brand.logo_url,
            description: outlet.brand.description,
            cuisines: outlet.brand.cuisines,
            is_featured: outlet.brand.is_featured
          },
          nearest_outlet: {
            _id: outlet._id,
            name: outlet.name,
            slug: outlet.slug,
            address: outlet.address,
            distance: Math.round(outlet.distance),
            avg_rating: outlet.avg_rating,
            total_reviews: outlet.total_reviews,
            price_range: outlet.price_range,
            delivery_time: outlet.delivery_time,
            is_pure_veg: outlet.is_pure_veg,
            media: outlet.media,
            contact: outlet.contact
          },
          total_outlets_nearby: 1
        });
      } else {
        // Increment outlet count for this brand
        brandMap.get(brandId).total_outlets_nearby++;
      }
    }

    const brands = Array.from(brandMap.values()).slice(0, limitNum);

    console.log(`✅ Returning ${brands.length} unique featured brands`);

    return sendSuccess(res, {
      brands,
      metadata: {
        total: brands.length,
        search_radius_km: radiusNum / 1000,
        center: { latitude: lat, longitude: lng }
      }
    });
  } catch (error: any) {
    console.error('Error in getFeaturedBrands:', error);
    return sendError(res, error.message || 'Failed to fetch featured brands', STATUS_CODE_SERVER_ERROR);
  }
};

/**
 * NEW: Get nearby outlets (outlet-centric)
 * Returns outlets with available items count and proper sorting
 * 
 * GET /api/v1/outlets/nearby
 */
export const getNearbyOutletsNew = async (req: Request, res: Response) => {
  try {
    const {
      latitude,
      longitude,
      radius = DEFAULT_NEARBY_RADIUS,
      limit = DEFAULT_NEARBY_LIMIT,
      isVeg,
      minRating,
      priceRange,
      cuisines,
      sortBy = 'distance',
      search
    } = req.query;

    if (!latitude || !longitude) {
      return sendError(res, 'Latitude and longitude are required', ErrorCode.VALIDATION_ERROR, STATUS_CODE_BAD_REQUEST);
    }

    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);
    const radiusNum = parseInt(radius as string);
    const limitNum = parseInt(limit as string);

    console.log(`📍 Finding nearby outlets near [${lat}, ${lng}] within ${radiusNum / 1000}km`);

    // Pre-compute outlet_ids that have a menu item matching the search term.
    // FoodItem has outlet_id directly (same collection that getTrendingDishes queries).
    let outletIdsWithItem: mongoose.Types.ObjectId[] = [];
    if (search) {
      outletIdsWithItem = await FoodItem.distinct('outlet_id', {
        name: { $regex: search as string, $options: 'i' },
        is_active: true,
        is_available: true
      });
      console.log(`🔍 Search "${search}": ${outletIdsWithItem.length} outlets have matching menu items`);
    }

    // Build match criteria
    const matchCriteria: any = {
      status: 'ACTIVE',
      approval_status: 'APPROVED'
    };

    if (isVeg === 'true') {
      matchCriteria.is_pure_veg = true;
    }

    if (minRating) {
      matchCriteria.avg_rating = { $gte: parseFloat(minRating as string) };
    }

    if (priceRange) {
      matchCriteria.price_range = parseInt(priceRange as string);
    }

    // Aggregation pipeline
    const pipeline: any[] = [
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          distanceField: 'distance',
          maxDistance: radiusNum,
          spherical: true,
          key: 'location',
          query: matchCriteria
        }
      },
      {
        $lookup: {
          from: 'brands',
          localField: 'brand_id',
          foreignField: '_id',
          as: 'brand'
        }
      },
      { $unwind: '$brand' },
      {
        $match: {
          'brand.verification_status': 'approved',
          'brand.is_active': true,
          ...(search ? {
            $or: [
              { name: { $regex: search, $options: 'i' } },
              { 'brand.name': { $regex: search, $options: 'i' } },
              // Include outlets that serve a menu item matching the search
              ...(outletIdsWithItem.length > 0 ? [{ _id: { $in: outletIdsWithItem } }] : [])
            ]
          } : {})
        }
      }
    ];

    // Check if user follows the outlet (Server-Side Join)
    if ((req as any).user?.id) {
      const userId = new mongoose.Types.ObjectId((req as any).user.id);
      pipeline.push({
        $lookup: {
          from: 'follows',
          let: { outletId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$outlet', '$$outletId'] },
                    { $eq: ['$user', userId] }
                  ]
                }
              }
            },
            { $limit: 1 }
          ],
          as: 'user_follow'
        }
      });

      pipeline.push({
        $addFields: {
          is_following: { $gt: [{ $size: '$user_follow' }, 0] }
        }
      });
    }

    // Filter by cuisines
    if (cuisines) {
      const cuisineArray = (cuisines as string).split(',').map(c => c.trim());
      pipeline.push({
        $match: {
          'brand.cuisines': { $in: cuisineArray }
        }
      });
    }

    // Get available items count per outlet
    pipeline.push({
      $lookup: {
        from: 'outletmenuitems',
        let: { outletId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$outlet_id', '$$outletId'] },
                  { $eq: ['$is_available', true] }
                ]
              }
            }
          },
          { $count: 'count' }
        ],
        as: 'items_count'
      }
    });

    pipeline.push({
      $addFields: {
        available_items_count: {
          $ifNull: [{ $arrayElemAt: ['$items_count.count', 0] }, 0]
        }
      }
    });

    // Sorting
    let sortStage: any = {};
    switch (sortBy) {
      case 'rating':
        sortStage = { avg_rating: -1, distance: 1 };
        break;
      case 'reviews':
        sortStage = { total_reviews: -1, distance: 1 };
        break;
      case 'delivery_time':
        sortStage = { delivery_time: 1, distance: 1 };
        break;
      default: // distance
        sortStage = { distance: 1 };
    }
    pipeline.push({ $sort: sortStage });

    pipeline.push({ $limit: limitNum });

    // Project final output
    pipeline.push({
      $project: {
        _id: 1,
        name: 1,
        slug: 1,
        address: 1,
        location: 1,
        distance: { $round: ['$distance', 0] },
        avg_rating: 1,
        total_reviews: 1,
        price_range: 1,
        delivery_time: 1,
        is_pure_veg: 1,
        media: 1,
        contact: 1,
        flags: 1,
        available_items_count: 1,
        is_following: 1,
        brand: {
          _id: '$brand._id',
          name: '$brand.name',
          slug: '$brand.slug',
          logo_url: '$brand.logo_url',
          cuisines: '$brand.cuisines'
        }
      }
    });

    const outlets = await Outlet.aggregate(pipeline);

    console.log(`✅ Found ${outlets.length} nearby outlets`);

    return sendSuccess(res, {
      outlets,
      metadata: {
        total: outlets.length,
        search_radius_km: radiusNum / 1000,
        center: { latitude: lat, longitude: lng },
        filters: {
          isVeg: isVeg || 'all',
          minRating: minRating || 'none',
          priceRange: priceRange || 'all',
          cuisines: cuisines || 'all',
          sortBy
        }
      }
    });
  } catch (error: any) {
    console.error('Error in getNearbyOutletsNew:', error);
    return sendError(res, error.message || 'Failed to fetch nearby outlets', STATUS_CODE_SERVER_ERROR);
  }
};

/**
 * Get outlet detail with full menu
 * GET /api/v1/outlets/:outletId/detail
 */
export const getOutletDetail = async (req: Request, res: Response) => {
  console.log('--- ENTERING getOutletDetail ---');
  try {
    const { outletId } = req.params;
    console.log(`[getOutletDetail] Requested ID/Slug: ${outletId}`);

    const outletDoc = await outletService.getOutletById(outletId);

    if (!outletDoc) {
      return sendError(res, 'Outlet not found [MARKER-NEW-LOGIC]', STATUS_CODE_NOT_FOUND);
    }

    const outlet = outletDoc.toObject();
    const actualOutletId = outlet._id;
    console.log(`[getOutletDetail] Resolved ID: ${actualOutletId}`);

    // Parallelize independent queries for better performance
    const userId = (req as any).user?.id;
    
    const [operatingHours, itemsCount, categories, followersCount, userFollow] = await Promise.all([
      // Get operating hours
      OperatingHours.find({ outlet_id: actualOutletId })
        .sort({ day_of_week: 1 })
        .select('day_of_week open_time close_time is_closed')
        .lean(),
      
      // Get available items count
      FoodItem.countDocuments({
        outlet_id: actualOutletId,
        is_available: true,
        is_active: true
      }),
      
      // Get menu categories with item counts
      FoodItem.aggregate([
      {
        $match: {
          outlet_id: new mongoose.Types.ObjectId(actualOutletId as any),
          is_available: true,
          is_active: true
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: 'category_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$category._id',
          name: { $first: '$category.name' },
          slug: { $first: '$category.slug' },
          items_count: { $sum: 1 }
        }
      },
        { $sort: { name: 1 } }
      ]),
      
      // Get followers count
      Follow.countDocuments({ outlet: actualOutletId }),
      
      // Get user follow status if logged in
      userId ? Follow.findOne({ user: userId, outlet: actualOutletId }).lean() : Promise.resolve(null)
    ]);

    // Transform operating hours to match frontend format
    const formattedHours = operatingHours.map((oh: any) => ({
      dayOfWeek: oh.day_of_week,
      open: oh.open_time,
      close: oh.close_time,
      isClosed: oh.is_closed
    }));

    const isFollowing = !!userFollow;

    return sendSuccess(res, {
      outlet: {
        ...outlet,
        available_items_count: itemsCount,
        followers_count: followersCount,
        is_following: isFollowing,
        opening_hours: formattedHours,
        order_phone: outlet.order_phone,
        order_link: outlet.order_link,
        flags: outlet.flags || {
          is_featured: false,
          is_trending: false,
          accepts_online_orders: false,
          is_open_now: false
        },
        social_media: outlet.social_media || {}
      },
      categories
    });
  } catch (error: any) {
    console.error('[getOutletDetail] FATAL ERROR:', error);
    console.error(error.stack);
    return sendError(res, `Outlet detail error: ${error.message}`, STATUS_CODE_SERVER_ERROR);
  }
};

/**
 * Get nearby malls (derived from outlet addresses containing mall/food court)
 * GET /api/v1/outlets/malls/nearby
 */
export const getNearbyMalls = async (req: Request, res: Response) => {
  try {
    const {
      latitude,
      longitude,
      radius = DEFAULT_MALL_NEARBY_RADIUS,
      limit = DEFAULT_MALL_NEARBY_LIMIT
    } = req.query;

    if (!latitude || !longitude) {
      return sendError(res, 'Latitude and longitude are required', ErrorCode.VALIDATION_ERROR, STATUS_CODE_BAD_REQUEST);
    }

    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);
    const radiusNum = parseInt(radius as string);
    const limitNum = parseInt(limit as string);

    const outlets = await Outlet.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          distanceField: 'distance',
          maxDistance: radiusNum,
          spherical: true,
          key: 'location',
          query: {
            status: 'ACTIVE',
            approval_status: 'APPROVED'
          }
        }
      },
      {
        $lookup: {
          from: 'brands',
          localField: 'brand_id',
          foreignField: '_id',
          as: 'brand'
        }
      },
      { $unwind: '$brand' },
      {
        $match: {
          'brand.verification_status': 'approved',
          'brand.is_active': true
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          slug: 1,
          address: 1,
          media: 1,
          avg_rating: 1,
          total_reviews: 1,
          distance: 1,
          brand: {
            _id: '$brand._id',
            name: '$brand.name',
            slug: '$brand.slug',
            logo_url: '$brand.logo_url'
          }
        }
      }
    ]);

    const mallMap = new Map<string, any>();

    for (const outlet of outlets) {
      const mallName = extractMallName(outlet.address?.full);
      if (!mallName) continue;

      const key = buildMallKey(mallName, outlet.address?.city, outlet.address?.state);
      const existing = mallMap.get(key);

      const outletPayload = {
        _id: outlet._id,
        name: outlet.name,
        slug: outlet.slug,
        avg_rating: outlet.avg_rating || 0,
        total_reviews: outlet.total_reviews || 0,
        distance: Math.round(outlet.distance || 0),
        logo_url: outlet.brand?.logo_url || outlet.media?.cover_image_url,
        brand: outlet.brand
      };

      if (!existing) {
        mallMap.set(key, {
          key,
          slug: toSlug(mallName),
          name: mallName,
          city: outlet.address?.city || null,
          state: outlet.address?.state || null,
          country: outlet.address?.country || null,
          distance: Math.round(outlet.distance || 0),
          cover_image_url: outlet.media?.cover_image_url || outlet.brand?.logo_url || null,
          outlet_count: 1,
          outlets_preview: [outletPayload]
        });
      } else {
        existing.outlet_count += 1;
        existing.distance = Math.min(existing.distance, Math.round(outlet.distance || 0));
        if (!existing.cover_image_url && (outlet.media?.cover_image_url || outlet.brand?.logo_url)) {
          existing.cover_image_url = outlet.media?.cover_image_url || outlet.brand?.logo_url;
        }
        if (existing.outlets_preview.length < 4) {
          existing.outlets_preview.push(outletPayload);
        }
      }
    }

    const malls = Array.from(mallMap.values())
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limitNum);

    return sendSuccess(res, {
      malls,
      metadata: {
        total: malls.length,
        search_radius_km: radiusNum / 1000,
        center: { latitude: lat, longitude: lng }
      }
    });
  } catch (error: any) {
    console.error('Error in getNearbyMalls:', error);
    return sendError(res, error.message || 'Failed to fetch nearby malls', ErrorCode.INTERNAL_SERVER_ERROR, STATUS_CODE_SERVER_ERROR);
  }
};

/**
 * Get mall detail with all mapped outlets (derived)
 * GET /api/v1/outlets/malls/:mallKey
 */
export const getMallDetail = async (req: Request, res: Response) => {
  try {
    const { mallKey } = req.params;
    const { latitude, longitude } = req.query;

    const lat = latitude ? parseFloat(latitude as string) : null;
    const lng = longitude ? parseFloat(longitude as string) : null;

    const outlets = await Outlet.find({
      status: 'ACTIVE',
      approval_status: 'APPROVED'
    })
      .populate('brand_id', 'name slug logo_url verification_status is_active')
      .select('name slug address media avg_rating total_reviews location brand_id')
      .lean();

    const matchedOutlets: any[] = [];
    let mallMeta: any = null;

    for (const outlet of outlets as any[]) {
      const brand = outlet.brand_id;
      if (!brand || brand.verification_status !== 'approved' || !brand.is_active) {
        continue;
      }

      const mallName = extractMallName(outlet.address?.full);
      if (!mallName) continue;

      const outletMallKey = buildMallKey(mallName, outlet.address?.city, outlet.address?.state);
      if (outletMallKey !== mallKey) continue;

      if (!mallMeta) {
        mallMeta = {
          key: mallKey,
          slug: toSlug(mallName),
          name: mallName,
          city: outlet.address?.city || null,
          state: outlet.address?.state || null,
          country: outlet.address?.country || null,
          cover_image_url: outlet.media?.cover_image_url || brand.logo_url || null
        };
      }

      let distance: number | null = null;
      if (
        lat !== null &&
        lng !== null &&
        Array.isArray(outlet.location?.coordinates) &&
        outlet.location.coordinates.length === 2
      ) {
        distance = calcDistanceMeters(
          lat,
          lng,
          outlet.location.coordinates[1],
          outlet.location.coordinates[0]
        );
      }

      matchedOutlets.push({
        _id: outlet._id,
        name: outlet.name,
        slug: outlet.slug,
        address: outlet.address,
        avg_rating: outlet.avg_rating || 0,
        total_reviews: outlet.total_reviews || 0,
        distance,
        logo_url: brand.logo_url || outlet.media?.cover_image_url,
        brand: {
          _id: brand._id,
          name: brand.name,
          slug: brand.slug,
          logo_url: brand.logo_url
        }
      });
    }

    if (!mallMeta) {
      return sendError(res, 'Mall not found', ErrorCode.RESOURCE_NOT_FOUND, STATUS_CODE_NOT_FOUND);
    }

    matchedOutlets.sort((a, b) => {
      if (a.distance === null && b.distance === null) return a.name.localeCompare(b.name);
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });

    return sendSuccess(res, {
      mall: {
        ...mallMeta,
        outlet_count: matchedOutlets.length
      },
      outlets: matchedOutlets
    });
  } catch (error: any) {
    console.error('Error in getMallDetail:', error);
    return sendError(res, error.message || 'Failed to fetch mall detail', ErrorCode.INTERNAL_SERVER_ERROR, STATUS_CODE_SERVER_ERROR);
  }
};
