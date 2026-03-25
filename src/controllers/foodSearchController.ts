import { Request, Response } from 'express';
import { searchService } from '../services/searchService.js';
import { sendSuccess, sendError } from '../utils/response.js';

export const getNearbyFood = async (req: Request, res: Response) => {
  try {
    const {
      latitude,
      longitude,
      radius,
      limit,
      isVeg,
      minRating,
      sortBy
    } = req.query;

    const result = await searchService.getNearbyFood({
      latitude: latitude as any,
      longitude: longitude as any,
      radius: radius ? parseInt(radius as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      isVeg: isVeg === 'true' ? true : (isVeg === 'false' ? false : undefined),
      minRating: minRating ? parseFloat(minRating as string) : undefined,
      sortBy: sortBy as any
    });

    return sendSuccess(res, result);
  } catch (error: any) {
    console.error('Error in getNearbyFood:', error);
    return sendError(res, error.message || 'Failed to fetch nearby food', null, error.statusCode || 500);
  }
};

export const getTrendingDishes = async (req: Request, res: Response) => {
  try {
    const {
      latitude,
      longitude,
      radius,
      limit,
      isVeg
    } = req.query;

    const result = await searchService.getTrendingDishes({
      latitude: latitude as any,
      longitude: longitude as any,
      radius: radius ? parseInt(radius as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      isVeg: isVeg === 'true'
    });

    return sendSuccess(res, result);
  } catch (error: any) {
    console.error('Error in getTrendingDishes:', error);
    return sendError(res, error.message || 'Failed to fetch trending dishes', null, error.statusCode || 500);
  }
};
