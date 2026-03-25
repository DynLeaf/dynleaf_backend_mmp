import * as brandRepo from '../../repositories/brandRepository.js';
import * as outletRepo from '../../repositories/outletRepository.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';

const parseNumber = (val: any, defaultVal: number): number => {
  const parsed = parseFloat(String(val));
  return isNaN(parsed) ? defaultVal : parsed;
};

export const getNearbyBrands = async (
  latitude: string,
  longitude: string,
  radius: string = '10000',
  page: number = 1,
  limit: number = 20,
  cuisines?: string,
  priceRange?: string,
  minRating?: string,
  sortBy: 'distance' | 'rating' | 'popularity' = 'distance',
  isVeg?: string
) => {
  const lat = parseNumber(latitude, 0);
  const lng = parseNumber(longitude, 0);
  const radiusMeters = parseNumber(radius, 10000);
  const skip = (page - 1) * limit;

  const outletMatchQuery: any = {
    status: 'ACTIVE',
    approval_status: 'APPROVED',
    'location.coordinates': { $exists: true, $ne: [] }
  };

  if (priceRange) outletMatchQuery.price_range = { $in: priceRange.split(',').map(Number) };
  if (minRating) outletMatchQuery.avg_rating = { $gte: parseNumber(minRating, 0) };
  if (isVeg === 'true') outletMatchQuery.is_pure_veg = true;

  const pipeline: any[] = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distance',
        maxDistance: radiusMeters,
        query: outletMatchQuery,
        spherical: true
      }
    },
    { $lookup: { from: 'brands', localField: 'brand_id', foreignField: '_id', as: 'brand' } },
    { $unwind: '$brand' },
    { $match: { 'brand.verification_status': 'approved', 'brand.is_active': true } }
  ];

  if (cuisines) {
    pipeline.push({ $match: { 'brand.cuisines': { $in: cuisines.split(',') } } });
  }

  pipeline.push({
    $group: {
      _id: '$brand_id',
      brand: { $first: '$brand' },
      outlets: { $push: '$$ROOT' },
      minDistance: { $min: '$distance' },
      avgRating: { $avg: '$avg_rating' },
      totalReviews: { $sum: '$total_reviews' }
    }
  });

  if (sortBy === 'rating') pipeline.push({ $sort: { avgRating: -1, minDistance: 1 } });
  else if (sortBy === 'popularity') pipeline.push({ $sort: { totalReviews: -1, minDistance: 1 } });
  else pipeline.push({ $sort: { minDistance: 1 } });

  pipeline.push({ $skip: skip }, { $limit: limit });

  pipeline.push({
    $project: {
      _id: '$brand._id',
      name: '$brand.name',
      slug: '$brand.slug',
      logo_url: '$brand.logo_url',
      description: '$brand.description',
      cuisines: '$brand.cuisines',
      is_featured: '$brand.is_featured',
      distance: { $round: ['$minDistance', 0] },
      avg_rating: { $round: ['$avgRating', 1] },
      total_reviews: '$totalReviews',
      outlet_count: { $size: '$outlets' },
      nearest_outlet: {
        _id: { $arrayElemAt: ['$outlets._id', 0] },
        name: { $arrayElemAt: ['$outlets.name', 0] },
        address: { $arrayElemAt: ['$outlets.address', 0] },
        delivery_time: { $arrayElemAt: ['$outlets.delivery_time', 0] }
      }
    }
  });

  const brands = await outletRepo.getNearbyOutletsAggregate(pipeline);

  const countPipeline = pipeline.slice(0, pipeline.findIndex(s => s.$skip !== undefined));
  countPipeline.push({ $count: 'total' });
  const countResult = await outletRepo.getNearbyOutletsAggregate(countPipeline);
  const total = (countResult[0] as any)?.total || 0;

  if (brands.length === 0 && latitude && longitude) {
    const fallbackBrands = await brandRepo.findActiveApprovedBrands(skip, limit);
    const fallbackTotal = await brandRepo.countActiveApprovedBrands();

    return {
      brands: fallbackBrands.map((b: any) => ({ ...b, distance: null, outlet_count: 0 })),
      total: fallbackTotal,
      message: 'No nearby restaurants found. Showing all available restaurants.'
    };
  }

  return { brands, total, message: null };
};

export const getFeaturedBrands = async (limit: number = 10) => {
  return await brandRepo.getFeaturedBrandsAggregate(limit);
};
