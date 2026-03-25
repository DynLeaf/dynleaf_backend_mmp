import * as outletRepo from '../../repositories/outletRepository.js';
import * as brandRepo from '../../repositories/brandRepository.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';

const EARTH_RADIUS_KM = 6371;

const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = EARTH_RADIUS_KM;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const parseNumber = (val: any, defaultVal: number): number => {
  const parsed = parseFloat(String(val));
  return isNaN(parsed) ? defaultVal : parsed;
};

export const getBrandOutlets = async (brandId: string, latitude?: string, longitude?: string, limit?: string, excludeOutletId?: string) => {
  const hasLocation = latitude && longitude;
  const lat = hasLocation ? parseFloat(latitude as string) : null;
  const lng = hasLocation ? parseFloat(longitude as string) : null;
  const limitNum = limit ? parseInt(limit as string) : undefined;

  const queryConditions: any = {};
  if (excludeOutletId) queryConditions._id = { $ne: excludeOutletId };

  const outlets = await outletRepo.findByBrandId(brandId);

  let formattedOutlets = outlets.map((outlet: any) => {
      const formatted: any = {
          id: outlet._id,
          name: outlet.name,
          slug: outlet.slug,
          address: {
              full_address: outlet.address?.full || `${outlet.address?.city || ''}, ${outlet.address?.state || ''}`.trim(),
              city: outlet.address?.city,
              state: outlet.address?.state,
              country: outlet.address?.country,
              pincode: outlet.address?.pincode
          },
          location: outlet.location,
          contact: outlet.contact,
          coverImage: outlet.media?.cover_image_url,
          restaurant_type: outlet.restaurant_type,
          vendor_types: outlet.vendor_types,
          social_media: outlet.social_media,
          rating: outlet.avg_rating || 0,
          total_reviews: outlet.total_reviews || 0
      };

      if (hasLocation && lat !== null && lng !== null && outlet.location?.coordinates) {
          const [outletLng, outletLat] = outlet.location.coordinates;
          const distance = calculateDistanceKm(lat, lng, outletLat, outletLng);
          formatted.distance = distance.toFixed(1);
          formatted._distanceValue = distance;
      }
      return formatted;
  });

  if (hasLocation && lat !== null && lng !== null) {
      formattedOutlets.sort((a: any, b: any) => (a._distanceValue || Infinity) - (b._distanceValue || Infinity));
      formattedOutlets = formattedOutlets.map((outlet: any) => {
          const { _distanceValue, ...rest } = outlet;
          return rest;
      });
  }

  const limitedOutlets = limitNum ? formattedOutlets.slice(0, limitNum) : formattedOutlets;
  return {
      outlets: limitedOutlets,
      total: formattedOutlets.length,
      showing: limitedOutlets.length,
      hasMore: formattedOutlets.length > limitedOutlets.length
  };
};

export const getNearbyOutlets = async (
  latitude: string,
  longitude: string,
  radius: string = '10000',
  page: number = 1,
  limit: number = 20,
  cuisines?: string,
  priceRange?: string,
  minRating?: string,
  sortBy: 'distance' | 'rating' | 'popularity' = 'distance',
  isVeg?: string,
  search?: string
) => {
  const lat = parseNumber(latitude, 0);
  const lng = parseNumber(longitude, 0);
  const radiusMeters = parseNumber(radius, 10000);
  const skip = (page - 1) * limit;

  const matchQuery: any = {
      status: 'ACTIVE',
      approval_status: 'APPROVED',
      'location.coordinates': { $exists: true, $ne: [] }
  };

  if (priceRange) matchQuery.price_range = { $in: priceRange.split(',').map(Number) };
  if (minRating) matchQuery.avg_rating = { $gte: parseNumber(minRating, 0) };
  if (isVeg === 'true') matchQuery.is_pure_veg = true;
  if (search) matchQuery.name = { $regex: search, $options: 'i' };

  const pipeline: any[] = [
      {
          $geoNear: {
              near: { type: 'Point', coordinates: [lng, lat] },
              distanceField: 'distance',
              maxDistance: radiusMeters,
              query: matchQuery,
              spherical: true
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
              $and: [
                  { $or: [{ 'brand.verification_status': 'approved' }, { 'brand.verification_status': 'verified' }, { 'brand.verification_status': { $exists: false } }] },
                  { $or: [{ 'brand.is_active': true }, { 'brand.is_active': { $exists: false } }] }
              ]
          }
      }
  ];

  if (cuisines) {
      pipeline.push({ $match: { 'brand.cuisines': { $in: cuisines.split(',') } } });
  }

  let sortCriteria: any = {};
  if (sortBy === 'rating') sortCriteria = { avg_rating: -1, distance: 1 };
  else if (sortBy === 'popularity') sortCriteria = { total_reviews: -1, distance: 1 };
  else sortCriteria = { distance: 1 };

  pipeline.push(
      { $sort: sortCriteria },
      { $skip: skip },
      { $limit: limit },
      {
          $project: {
              name: 1,
              slug: 1,
              address: { city: 1, state: 1, full: 1 },
              location: 1,
              media: { cover_image_url: 1 },
              brand: { name: 1, slug: 1, logo_url: 1, cuisines: 1 },
              avg_rating: { $round: ['$avg_rating', 1] },
              total_reviews: 1,
              delivery_time: 1,
              distance: { $round: ['$distance', 0] }
          }
      }
  );

  const outlets = await outletRepo.getNearbyOutletsAggregate(pipeline);
  
  const countPipeline = pipeline.slice(0, pipeline.findIndex(s => s.$skip !== undefined));
  countPipeline.push({ $count: 'total' });
  const countResult = await outletRepo.getNearbyOutletsAggregate(countPipeline);
  const total = (countResult[0] as any)?.total || 0;

  return {
      outlets: outlets.map((o: any) => ({
          ...o,
          distance: o.distance ? (o.distance / 1000).toFixed(1) : null
      })),
      total,
      hasMore: total > skip + outlets.length
  };
};

export const getFeaturedOutlets = async (limit: number = 10) => {
  const pipeline = [
      {
          $match: {
              status: 'ACTIVE',
              approval_status: 'APPROVED',
              'flags.is_featured': true
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
              $and: [
                  { $or: [{ 'brand.verification_status': 'approved' }, { 'brand.verification_status': 'verified' }, { 'brand.verification_status': { $exists: false } }] },
                  { $or: [{ 'brand.is_active': true }, { 'brand.is_active': { $exists: false } }] }
              ]
          }
      },
      {
          $project: {
              name: 1, slug: 1, address: { city: 1, state: 1, full: 1 },
              media: { cover_image_url: 1 }, brand: { name: 1, logo_url: 1, cuisines: 1 },
              avg_rating: { $round: ['$avg_rating', 1] }, total_reviews: 1
          }
      },
      { $sort: { avg_rating: -1, total_reviews: -1 } as Record<string, 1 | -1> },
      { $limit: limit }
  ];
  return await outletRepo.getNearbyOutletsAggregate(pipeline);
};
