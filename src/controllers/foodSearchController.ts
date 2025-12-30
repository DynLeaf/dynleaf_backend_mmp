import { Request, Response } from 'express';
import { OutletMenuItem } from '../models/OutletMenuItem.js';
import { FoodItem } from '../models/FoodItem.js';

/**
 * NEW: Get nearby food items using OutletMenuItem
 * Uses geospatial queries on OutletMenuItem collection
 * Returns food items with outlet details and accurate distance
 * 
 * GET /api/v1/food/nearby
 * Query: latitude, longitude, radius, limit, isVeg, minRating, sortBy
 */
export const getNearbyFood = async (req: Request, res: Response) => {
  try {
    const {
      latitude,
      longitude,
      radius = 50000, // 50km default
      limit = 20,
      isVeg,
      minRating,
      sortBy = 'distance' // distance, popular, rating, price_low, price_high
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

    console.log(`🔍 Finding nearby food near [${lat}, ${lng}] within ${radiusNum / 1000}km`);

    // Build aggregation pipeline
    const pipeline: any[] = [
      // Stage 1: Geospatial search (uses 2dsphere index)
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          distanceField: 'distance',
          maxDistance: radiusNum,
          spherical: true,
          query: {
            is_available: true
          }
        }
      },
      
      // Stage 2: Lookup food item details
      {
        $lookup: {
          from: 'fooditems',
          localField: 'food_item_id',
          foreignField: '_id',
          as: 'food_item'
        }
      },
      { $unwind: '$food_item' },
      
      // Stage 3: Lookup outlet details
      {
        $lookup: {
          from: 'outlets',
          localField: 'outlet_id',
          foreignField: '_id',
          as: 'outlet'
        }
      },
      { $unwind: '$outlet' },
      
      // Stage 4: Lookup brand details
      {
        $lookup: {
          from: 'brands',
          localField: 'brand_id',
          foreignField: '_id',
          as: 'brand'
        }
      },
      { $unwind: '$brand' },
      
      // Stage 5: Lookup category
      {
        $lookup: {
          from: 'categories',
          localField: 'food_item.category_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      {
        $unwind: {
          path: '$category',
          preserveNullAndEmptyArrays: true
        }
      },
      
      // Stage 6: Filter active outlets and approved brands
      {
        $match: {
          'outlet.status': 'ACTIVE',
          'outlet.approval_status': 'APPROVED',
          'brand.verification_status': 'approved',
          'food_item.is_active': true
        }
      }
    ];

    // Apply veg filter
    if (isVeg === 'true') {
      pipeline.push({
        $match: { 'food_item.is_veg': true }
      });
    } else if (isVeg === 'false') {
      pipeline.push({
        $match: { 'food_item.is_veg': false }
      });
    }

    // Apply rating filter
    if (minRating) {
      pipeline.push({
        $match: { rating_at_outlet: { $gte: parseFloat(minRating as string) } }
      });
    }

    // Add computed fields
    pipeline.push({
      $addFields: {
        final_price: {
          $ifNull: ['$price_override', '$food_item.base_price']
        },
        final_discount: {
          $ifNull: ['$discount_override', '$food_item.discount_percentage']
        }
      }
    });

    // Sorting
    let sortStage: any = {};
    switch (sortBy) {
      case 'popular':
        sortStage = { orders_at_outlet: -1, distance: 1 };
        break;
      case 'rating':
        sortStage = { rating_at_outlet: -1, distance: 1 };
        break;
      case 'price_low':
        sortStage = { final_price: 1, distance: 1 };
        break;
      case 'price_high':
        sortStage = { final_price: -1, distance: 1 };
        break;
      default: // distance
        sortStage = { distance: 1 };
    }
    pipeline.push({ $sort: sortStage });

    // Limit results
    pipeline.push({ $limit: limitNum });

    // Project final output
    pipeline.push({
      $project: {
        _id: 0,
        food_item_id: '$food_item._id',
        name: '$food_item.name',
        description: '$food_item.description',
        image: '$food_item.image_url',
        images: '$food_item.images',
        is_veg: '$food_item.is_veg',
        
        category: {
          _id: '$category._id',
          name: '$category.name',
          slug: '$category.slug'
        },
        
        // Outlet info
        outlet: {
          _id: '$outlet._id',
          name: '$outlet.name',
          slug: '$outlet.slug',
          address: '$outlet.address',
          distance: { $round: ['$distance', 0] }
        },
        
        // Brand info
        brand: {
          _id: '$brand._id',
          name: '$brand.name',
          logo_url: '$brand.logo_url',
          cuisines: '$brand.cuisines'
        },
        
        // Pricing
        price: '$final_price',
        base_price: '$food_item.base_price',
        discount: '$final_discount',
        
        // Availability
        is_available: '$is_available',
        stock_status: '$stock_status',
        
        // Engagement
        orders: '$orders_at_outlet',
        rating: '$rating_at_outlet',
        votes: '$votes_at_outlet',
        
        // Details
        preparation_time: {
          $ifNull: ['$preparation_time_override', '$food_item.preparation_time']
        },
        spice_level: '$food_item.spice_level',
        calories: '$food_item.calories',
        allergens: '$food_item.allergens',
        tags: '$food_item.tags',
        
        // Flags
        is_featured: '$is_featured_at_outlet',
        is_signature: '$food_item.is_signature',
        custom_note: '$custom_note'
      }
    });

    // Execute query
    const results = await OutletMenuItem.aggregate(pipeline);

    console.log(`✅ Found ${results.length} nearby food items`);

    res.json({
      status: true,
      data: {
        items: results,
        metadata: {
          total: results.length,
          search_radius_km: radiusNum / 1000,
          center: { latitude: lat, longitude: lng },
          filters: {
            isVeg: isVeg || 'all',
            minRating: minRating || 'none',
            sortBy
          }
        }
      }
    });
  } catch (error: any) {
    console.error('Error in getNearbyFood:', error);
    res.status(500).json({
      status: false,
      message: error.message || 'Failed to fetch nearby food'
    });
  }
};

/**
 * NEW: Get trending dishes near user
 * Based on orders_at_outlet metric
 * 
 * GET /api/v1/food/trending
 */
export const getTrendingDishesNew = async (req: Request, res: Response) => {
  try {
    const {
      latitude,
      longitude,
      radius = 50000,
      limit = 20,
      isVeg
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

    console.log(`🔥 Finding trending dishes near [${lat}, ${lng}]`);

    const pipeline: any[] = [
      // Geospatial search on FoodItem.location
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          distanceField: 'distance',
          maxDistance: radiusNum,
          spherical: true,
          query: {
            is_available: true,
            is_active: true,
            order_count: { $gt: 0 } // Must have orders
          }
        }
      },
      
      // Lookup outlet
      {
        $lookup: {
          from: 'outlets',
          localField: 'outlet_id',
          foreignField: '_id',
          as: 'outlet'
        }
      },
      { $unwind: '$outlet' },
      
      // Lookup brand from outlet
      {
        $lookup: {
          from: 'brands',
          localField: 'outlet.brand_id',
          foreignField: '_id',
          as: 'brand'
        }
      },
      { $unwind: '$brand' },
      
      // Lookup category
      {
        $lookup: {
          from: 'categories',
          localField: 'category_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      
      // Filter
      {
        $match: {
          'outlet.status': 'ACTIVE',
          'outlet.approval_status': 'APPROVED'
        }
      }
    ];

    // Veg filter - now using food_type
    if (isVeg === 'true') {
      pipeline.push({ $match: { food_type: { $in: ['veg', 'vegan'] } } });
    }

    // Sort by popularity (orders), then by distance
    pipeline.push({
      $sort: {
        order_count: -1,
        distance: 1
      }
    });

    // Limit
    pipeline.push({ $limit: limitNum });

    // Project
    pipeline.push({
      $project: {
        _id: '$_id',
        name: '$name',
        image: '$primary_image',
        is_veg: '$is_veg',
        food_type: '$food_type',
        price: '$price',
        outlet: {
          _id: '$outlet._id',
          name: '$outlet.name',
          distance: { $round: ['$distance', 0] }
        },
        brand: {
          _id: '$brand._id',
          name: '$brand.name',
          logo_url: '$brand.logo_url'
        },
        category: {
          _id: '$category._id',
          name: '$category.name'
        },
        orders: '$order_count',
        rating: '$avg_rating',
        is_bestseller: '$is_bestseller',
        is_new: '$is_new'
      }
    });

    const results = await FoodItem.aggregate(pipeline);

    console.log(`🔥 Found ${results.length} trending dishes`);

    res.json({
      status: true,
      data: {
        dishes: results
      }
    });
  } catch (error: any) {
    console.error('Error in getTrendingDishesNew:', error);
    res.status(500).json({
      status: false,
      message: error.message || 'Failed to fetch trending dishes'
    });
  }
};
