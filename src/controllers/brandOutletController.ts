import { Request, Response } from 'express';
import * as brandOutletService from '../services/brand/brandOutletService.js';
import * as outletService from '../services/outletService.js';
import { sendSuccess, sendError, ErrorCode } from '../utils/response.js';

interface AuthRequest extends Request {
    user?: { id: string };
}

const DEFAULT_FEATURED_LIMIT = 10;
const DEFAULT_FEATURED_RADIUS = 100000;
const DEFAULT_NEARBY_RADIUS = 50000;
const DEFAULT_NEARBY_LIMIT = 20;
const DEFAULT_MALL_NEARBY_RADIUS = 30000;
const DEFAULT_MALL_NEARBY_LIMIT = 20;

export const getFeaturedBrands = async (req: Request, res: Response) => {
    try {
        const { latitude, longitude, limit = DEFAULT_FEATURED_LIMIT, radius = DEFAULT_FEATURED_RADIUS } = req.query;
        if (!latitude || !longitude) return sendError(res, 'Latitude and longitude are required', ErrorCode.VALIDATION_ERROR, 400);
        const brands = await brandOutletService.getFeaturedBrands({
            lat: parseFloat(latitude as string), lng: parseFloat(longitude as string),
            limitNum: parseInt(limit as string), radiusNum: parseInt(radius as string)
        });
        return sendSuccess(res, { brands, metadata: { total: brands.length, search_radius_km: parseInt(radius as string) / 1000, center: { latitude: parseFloat(latitude as string), longitude: parseFloat(longitude as string) } } });
    } catch (error: unknown) { return sendError(res, (error as Error).message || 'Failed to fetch featured brands', 500); }
};

export const getNearbyOutletsNew = async (req: AuthRequest, res: Response) => {
    try {
        const { latitude, longitude, radius = DEFAULT_NEARBY_RADIUS, limit = DEFAULT_NEARBY_LIMIT, isVeg, minRating, priceRange, cuisines, sortBy = 'distance', search } = req.query;
        if (!latitude || !longitude) return sendError(res, 'Latitude and longitude are required', ErrorCode.VALIDATION_ERROR, 400);
        const radiusNum = parseInt(radius as string);
        const outlets = await brandOutletService.getNearbyOutlets({
            lat: parseFloat(latitude as string), lng: parseFloat(longitude as string),
            radiusNum, limitNum: parseInt(limit as string),
            isVeg: isVeg as string, minRating: minRating as string, priceRange: priceRange as string,
            cuisines: cuisines as string, sortBy: sortBy as string, search: search as string,
            userId: req.user?.id
        });
        return sendSuccess(res, { outlets, metadata: { total: outlets.length, search_radius_km: radiusNum / 1000, center: { latitude: parseFloat(latitude as string), longitude: parseFloat(longitude as string) }, filters: { isVeg: isVeg || 'all', minRating: minRating || 'none', priceRange: priceRange || 'all', cuisines: cuisines || 'all', sortBy } } });
    } catch (error: unknown) { return sendError(res, (error as Error).message || 'Failed to fetch nearby outlets', 500); }
};

export const getOutletDetail = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const outletDoc = await outletService.getOutletById(outletId);
        if (!outletDoc) return sendError(res, 'Outlet not found', 404);
        const outlet = (outletDoc as unknown as { toObject(): Record<string, unknown> }).toObject();
        const { operatingHours, itemsCount, categories, followersCount, isFollowing } = await brandOutletService.getOutletDetail(outlet._id, req.user?.id);
        return sendSuccess(res, { outlet: { ...outlet, available_items_count: itemsCount, followers_count: followersCount, is_following: isFollowing, opening_hours: operatingHours, order_phone: outlet.order_phone, order_link: outlet.order_link, flags: outlet.flags || { is_featured: false, is_trending: false, accepts_online_orders: false, is_open_now: false }, social_media: outlet.social_media || {} }, categories });
    } catch (error: unknown) { return sendError(res, `Outlet detail error: ${(error as Error).message}`, 500); }
};

export const getNearbyMalls = async (req: Request, res: Response) => {
    try {
        const { latitude, longitude, radius = DEFAULT_MALL_NEARBY_RADIUS, limit = DEFAULT_MALL_NEARBY_LIMIT } = req.query;
        if (!latitude || !longitude) return sendError(res, 'Latitude and longitude are required', ErrorCode.VALIDATION_ERROR, 400);
        const radiusNum = parseInt(radius as string);
        const limitNum = parseInt(limit as string);
        const malls = await brandOutletService.getNearbyMalls({ lat: parseFloat(latitude as string), lng: parseFloat(longitude as string), radiusNum, limitNum });
        return sendSuccess(res, { malls, metadata: { total: malls.length, search_radius_km: radiusNum / 1000, center: { latitude: parseFloat(latitude as string), longitude: parseFloat(longitude as string) } } });
    } catch (error: unknown) { return sendError(res, (error as Error).message || 'Failed to fetch nearby malls', ErrorCode.INTERNAL_SERVER_ERROR, 500); }
};

export const getMallDetail = async (req: Request, res: Response) => {
    try {
        const { mallKey } = req.params;
        const { latitude, longitude } = req.query;
        const lat = latitude ? parseFloat(latitude as string) : null;
        const lng = longitude ? parseFloat(longitude as string) : null;
        const result = await brandOutletService.getMallDetail(mallKey, lat, lng);
        return sendSuccess(res, result);
    } catch (error: unknown) {
        const msg = (error as Error).message;
        if (msg === 'Mall not found') return sendError(res, msg, ErrorCode.RESOURCE_NOT_FOUND, 404);
        return sendError(res, msg || 'Failed to fetch mall detail', ErrorCode.INTERNAL_SERVER_ERROR, 500);
    }
};
