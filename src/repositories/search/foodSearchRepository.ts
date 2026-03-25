import mongoose from 'mongoose';
import { OutletMenuItem } from '../../models/OutletMenuItem.js';
import { FoodItem } from '../../models/FoodItem.js';

export class FoodSearchRepository {
  async getNearbyFood(params: {
    lng: number;
    lat: number;
    radius: number;
    limit: number;
    isVeg?: boolean;
    minRating?: number;
    sortStage: any;
  }) {
    const pipeline: any[] = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [params.lng, params.lat] },
          distanceField: 'distance',
          maxDistance: params.radius,
          spherical: true,
          query: { is_available: true }
        }
      },
      {
        $lookup: {
          from: 'fooditems',
          localField: 'food_item_id',
          foreignField: '_id',
          as: 'food_item'
        }
      },
      { $unwind: '$food_item' },
      {
        $lookup: {
          from: 'outlets',
          localField: 'outlet_id',
          foreignField: '_id',
          as: 'outlet'
        }
      },
      { $unwind: '$outlet' },
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
        $lookup: {
          from: 'categories',
          localField: 'food_item.category_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          'outlet.status': 'ACTIVE',
          'outlet.approval_status': 'APPROVED',
          'brand.verification_status': 'approved',
          'food_item.is_active': true
        }
      }
    ];

    if (params.isVeg !== undefined) {
      pipeline.push({ $match: { 'food_item.is_veg': params.isVeg } });
    }

    if (params.minRating) {
      pipeline.push({ $match: { rating_at_outlet: { $gte: params.minRating } } });
    }

    pipeline.push({
      $addFields: {
        final_price: { $ifNull: ['$price_override', '$food_item.base_price'] },
        final_discount: { $ifNull: ['$discount_override', '$food_item.discount_percentage'] }
      }
    });

    pipeline.push({ $sort: params.sortStage });
    pipeline.push({ $limit: params.limit });

    pipeline.push({
      $project: {
        _id: 0,
        food_item_id: '$food_item._id',
        name: '$food_item.name',
        description: '$food_item.description',
        image: '$food_item.image_url',
        is_veg: '$food_item.is_veg',
        category: { id: '$category._id', name: '$category.name', slug: '$category.slug' },
        outlet: { id: '$outlet._id', name: '$outlet.name', slug: '$outlet.slug', distance: { $round: ['$distance', 0] } },
        brand: { id: '$brand._id', name: '$brand.name', logo_url: '$brand.logo_url' },
        price: '$final_price',
        rating: '$rating_at_outlet',
        orders: '$orders_at_outlet'
      }
    });

    return OutletMenuItem.aggregate(pipeline);
  }

  async getTrendingDishes(params: {
    lng: number;
    lat: number;
    radius: number;
    limit: number;
    isVeg?: boolean;
  }) {
    const pipeline: any[] = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [params.lng, params.lat] },
          distanceField: 'distance',
          maxDistance: params.radius,
          spherical: true,
          query: { is_available: true, is_active: true, order_count: { $gt: 0 } }
        }
      },
      {
        $lookup: { from: 'outlets', localField: 'outlet_id', foreignField: '_id', as: 'outlet' }
      },
      { $unwind: '$outlet' },
      {
        $lookup: { from: 'brands', localField: 'outlet.brand_id', foreignField: '_id', as: 'brand' }
      },
      { $unwind: '$brand' },
      {
        $lookup: { from: 'categories', localField: 'category_id', foreignField: '_id', as: 'category' }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $match: { 'outlet.status': 'ACTIVE', 'outlet.approval_status': 'APPROVED' }
      }
    ];

    if (params.isVeg === true) {
      pipeline.push({ $match: { food_type: { $in: ['veg', 'vegan'] } } });
    }

    pipeline.push({ $sort: { order_count: -1, distance: 1 } });
    pipeline.push({ $limit: params.limit });

    pipeline.push({
      $project: {
        _id: '$_id',
        name: '$name',
        image: '$primary_image',
        is_veg: '$is_veg',
        price: '$price',
        outlet: { id: '$outlet._id', name: '$outlet.name', distance: { $round: ['$distance', 0] } },
        brand: { id: '$brand._id', name: '$brand.name', logo_url: '$brand.logo_url' },
        category: { id: '$category._id', name: '$category.name' },
        orders: '$order_count',
        rating: '$avg_rating'
      }
    });

    return FoodItem.aggregate(pipeline);
  }
}

export const foodSearchRepository = new FoodSearchRepository();
