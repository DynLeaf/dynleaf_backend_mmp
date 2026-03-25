import { foodSearchRepository } from '../repositories/search/foodSearchRepository.js';
import { outletSearchRepository } from '../repositories/search/outletSearchRepository.js';
import { SearchNearbyRequestDto } from '../dto/search/search.dto.js';
import { AppError } from '../errors/AppError.js';

export class SearchService {
  async getNearbyFood(params: SearchNearbyRequestDto) {
    const { lat, lng } = this.validateCoords(params.latitude, params.longitude);
    const radius = params.radius || 50000;
    const limit = params.limit || 20;
    const sortStage = this.getFoodSortStage(params.sortBy || 'distance');

    const items = await foodSearchRepository.getNearbyFood({
      lat,
      lng,
      radius,
      limit,
      isVeg: params.isVeg,
      minRating: params.minRating,
      sortStage
    });

    return {
      items,
      metadata: {
        total: items.length,
        search_radius_km: radius / 1000,
        center: { latitude: lat, longitude: lng }
      }
    };
  }

  async getTrendingDishes(params: SearchNearbyRequestDto) {
    const { lat, lng } = this.validateCoords(params.latitude, params.longitude);
    const radius = params.radius || 50000;
    const limit = params.limit || 20;

    const dishes = await foodSearchRepository.getTrendingDishes({
      lat,
      lng,
      radius,
      limit,
      isVeg: params.isVeg
    });

    return { dishes };
  }

  // Outlet search orchestration could go here too if we want to fully consolidate
  // For now, focusing on the foodSearchController refactor

  private validateCoords(latitude: any, longitude: any): { lat: number; lng: number } {
    const lat = parseFloat(String(latitude));
    const lng = parseFloat(String(longitude));

    if (isNaN(lat) || isNaN(lng)) {
      throw new AppError('Invalid coordinates format', 400);
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new AppError('Coordinates out of valid range', 400);
    }

    return { lat, lng };
  }

  private getFoodSortStage(sortBy: string): any {
    switch (sortBy) {
      case 'popular':
        return { orders_at_outlet: -1, distance: 1 };
      case 'rating':
        return { rating_at_outlet: -1, distance: 1 };
      case 'price_low':
        return { final_price: 1, distance: 1 };
      case 'price_high':
        return { final_price: -1, distance: 1 };
      default:
        return { distance: 1 };
    }
  }
}

export const searchService = new SearchService();
