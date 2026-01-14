import { Request, Response } from 'express';
import { Outlet } from '../models/Outlet.js';
import { FoodItem } from '../models/FoodItem.js';
import { Category } from '../models/Category.js';
import { OperatingHours } from '../models/OperatingHours.js';
import { Follow } from '../models/Follow.js';
import mongoose from 'mongoose';

/**
 * NEW: Get featured brands with their nearest outlet
 * Returns unique brands (deduplicated) with nearest outlet details
 * 
 * GET /api/v1/brands/featured
 */
export const getFeaturedBrands = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude, limit = 10, radius = 100000 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        status: false,
        message: 'Latitude and longitude are required'
      });
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

    // Convert to array and limit
    const brands = Array.from(brandMap.values()).slice(0, limitNum);

    console.log(`✅ Returning ${brands.length} unique featured brands`);

    res.json({
      status: true,
      data: {
        brands,
        metadata: {
          total: brands.length,
          search_radius_km: radiusNum / 1000,
          center: { latitude: lat, longitude: lng }
        }
      }
    });
  } catch (error: any) {
    console.error('Error in getFeaturedBrands:', error);
    res.status(500).json({
      status: false,
      message: error.message || 'Failed to fetch featured brands'
    });
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
      radius = 50000,
      limit = 20,
      isVeg,
      minRating,
      priceRange,
      cuisines,
      sortBy = 'distance' // distance, rating, reviews, delivery_time
    } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        status: false,
        message: 'Latitude and longitude are required'
      });
    }

    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);
    const radiusNum = parseInt(radius as string);
    const limitNum = parseInt(limit as string);

    console.log(`📍 Finding nearby outlets near [${lat}, ${lng}] within ${radiusNum / 1000}km`);

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
          'brand.is_active': true
        }
      }
    ];

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

    res.json({
      status: true,
      data: {
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
      }
    });
  } catch (error: any) {
    console.error('Error in getNearbyOutletsNew:', error);
    res.status(500).json({
      status: false,
      message: error.message || 'Failed to fetch nearby outlets'
    });
  }
};

/**
 * Get outlet detail with full menu
 * GET /api/v1/outlets/:outletId/detail
 */
export const getOutletDetail = async (req: Request, res: Response) => {
  try {
    const { outletId } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(outletId)) {
      return res.status(400).json({
        status: false,
        message: 'Invalid outlet ID'
      });
    }

    // Get outlet with brand
    const outlet = await Outlet.findById(outletId)
      .populate('brand_id', 'name slug logo_url description cuisines social_media verification_status')
      .lean();

    if (!outlet) {
      return res.status(404).json({
        status: false,
        message: 'Outlet not found'
      });
    }

    // Get operating hours from OperatingHours collection
    const operatingHours = await OperatingHours.find({
      outlet_id: outletId
    })
      .sort({ day_of_week: 1 })
      .select('day_of_week open_time close_time is_closed')
      .lean();

    // Transform operating hours to match frontend format
    const formattedHours = operatingHours.map(oh => ({
      dayOfWeek: oh.day_of_week,
      open: oh.open_time,
      close: oh.close_time,
      isClosed: oh.is_closed
    }));

    // Get available items count
    const itemsCount = await FoodItem.countDocuments({
      outlet_id: outletId,
      is_available: true,
      is_active: true
    });

    // Get menu categories with item counts
    const categories = await FoodItem.aggregate([
      {
        $match: {
          outlet_id: new mongoose.Types.ObjectId(outletId),
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
    ]);

    // Get followers count
    const followersCount = await Follow.countDocuments({ outlet: outletId });

    res.json({
      status: true,
      data: {
        outlet: {
          ...outlet,
          available_items_count: itemsCount,
          followers_count: followersCount,
          opening_hours: formattedHours,
          // Ensure outlet-centric fields are explicitly included
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
      }
    });
  } catch (error: any) {
    console.error('Error in getOutletDetail:', error);
    res.status(500).json({
      status: false,
      message: error.message || 'Failed to fetch outlet detail'
    });
  }
};
