import { Request, Response } from 'express';
import { AuthRequest } from '../types/express.js';
import * as outletService from '../services/outletService.js';
import * as outletDiscoveryService from '../services/outlet/outletDiscoveryService.js';
import * as outletContentService from '../services/outlet/outletContentService.js';
import { updateOperatingHoursFromEndpoint } from '../services/operatingHoursService.js';
import { sendSuccess, sendError, sendAuthError } from '../utils/response.js';
import { AppError } from '../errors/AppError.js';
import { getOutletSubscriptionSummary } from '../utils/subscriptionSummary.js';
import { validateOptionalHttpUrl } from '../utils/url.js';
import mongoose from 'mongoose';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

const handleError = (res: Response, error: unknown): Response => {
  if (error instanceof AppError) {
    if (error.statusCode === 401) return sendAuthError(res, error.errorCode, error.message);
    return sendError(res, error.message, error.errorCode, error.statusCode);
  }
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  return sendError(res, message, 'INTERNAL_ERROR', 500);
};

export const createOutlet = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    validateOptionalHttpUrl('Google review link', req.body.socialMedia?.google_review);

    // Create mapping matching old behavior exactly
    const payload = {
      name: req.body.name,
      contact: req.body.contact,
      address: req.body.address,
      location: req.body.latitude && req.body.longitude ? { type: 'Point', coordinates: [parseFloat(req.body.longitude), parseFloat(req.body.latitude)] } : req.body.location,
      media: { cover_image_url: req.body.coverImage }, // service will handle s3
      restaurant_type: req.body.restaurantType,
      vendor_types: req.body.vendorTypes,
      seating_capacity: req.body.seatingCapacity,
      table_count: req.body.tableCount,
      social_media: req.body.socialMedia
    };

    const outlet = await outletService.createOutlet(req.user.id, req.body.brandId, payload as any);

    // Update remaining fields via service
    const extras: any = {};
    if (req.body.priceRange) extras.price_range = req.body.priceRange;
    if (req.body.isPureVeg !== undefined) extras.is_pure_veg = req.body.isPureVeg;
    if (req.body.deliveryTime) extras.delivery_time = req.body.deliveryTime;

    if (Object.keys(extras).length > 0) {
      await outletService.updateOutlet(String(outlet._id), req.user.id, extras);
    }

    return sendSuccess(res, { id: outlet._id, brandId: outlet.brand_id, name: outlet.name, slug: outlet.slug }, 'Outlet created successfully', 201);
  } catch (error) { return handleError(res, error); }
};

export const getUserOutlets = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const outlets = await outletService.getUserOutlets(req.user.id);
    return sendSuccess(res, { outlets });
  } catch (error) { return handleError(res, error); }
};

export const getUserOutletsList = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const outlets = await outletService.getUserOutletsList(req.user.id);
    return sendSuccess(res, { outlets });
  } catch (error) { return handleError(res, error); }
};

export const getOutletById = async (req: AuthRequest, res: Response) => {
  try {
    const outlet = await outletService.getOutletById(req.params.outletId);
    if (!outlet) return sendError(res, 'Outlet not found', 'RESOURCE_NOT_FOUND', 404);

    const actualOutletId = outlet._id.toString();
    const userRoles = req.user?.roles || [];
    const brandId = (outlet.brand_id as any)?._id?.toString() || outlet.brand_id?.toString();

    const hasOutletAccess = userRoles.some(r => r.role === 'admin' || (r.scope === 'outlet' && r.outletId?.toString() === actualOutletId) || (r.scope === 'brand' && r.brandId?.toString() === brandId));

    const outletPayload: any = { ...outlet.toObject(), operatingHours: [], is_following: false, followers_count: 0 };

    if (hasOutletAccess) {
      const summary = await getOutletSubscriptionSummary(actualOutletId, { assignedByUserId: req.user?.id, notes: 'Auto-created on access' });
      outletPayload.subscription = summary.subscription;
      outletPayload.free_tier = summary.free_tier;
      outletPayload.had_paid_plan_before = summary.had_paid_plan_before;
    }
    return sendSuccess(res, { outlet: outletPayload });
  } catch (error) { return handleError(res, error); }
};

export const updateOutlet = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const { outletId } = req.params;
    const data = req.body;

    validateOptionalHttpUrl('Google review link', data?.social_media?.google_review);
    validateOptionalHttpUrl('Swiggy delivery URL', data?.swiggyDeliveryUrl);
    validateOptionalHttpUrl('Zomato delivery URL', data?.zomatoDeliveryUrl);
    validateOptionalHttpUrl('Reservation URL', data?.reservationUrl);

    const updateData: any = { ...data };
    if (data.deliveryEnabled !== undefined) { updateData.flags = { ...(data.flags || {}), accepts_online_orders: Boolean(data.deliveryEnabled) }; }
    if (data.orderPhone) updateData.order_phone = data.orderPhone;
    if (data.orderLink) updateData.order_link = data.orderLink;
    if (data.swiggyDeliveryUrl) updateData.swiggy_delivery_url = data.swiggyDeliveryUrl;
    if (data.zomatoDeliveryUrl) updateData.zomato_delivery_url = data.zomatoDeliveryUrl;
    if (data.reservationPhone) updateData.reservation_phone = data.reservationPhone;
    if (data.reservationUrl) updateData.reservation_url = data.reservationUrl;
    if (data.coverImage) updateData.media = { ...(data.media || {}), cover_image_url: data.coverImage };
    if (data.seatingCapacity) updateData.seating_capacity = data.seatingCapacity;
    if (data.tableCount) updateData.table_count = data.tableCount;

    if (data.operatingHours !== undefined) {
      await updateOperatingHoursFromEndpoint(outletId, DEFAULT_TIMEZONE, data.operatingHours);
      delete updateData.operatingHours;
    }

    const outlet = await outletService.updateOutlet(outletId, req.user.id, updateData);
    if (!outlet) return sendError(res, 'Outlet not found or unauthorized', 'RESOURCE_NOT_FOUND', 404);

    return sendSuccess(res, { id: outlet._id, name: outlet.name }, 'Outlet updated successfully');
  } catch (error) { return handleError(res, error); }
};

export const saveCompliance = async (req: AuthRequest, res: Response) => {
  try {
    await outletContentService.saveCompliance(req.params.outletId, req.body);
    return sendSuccess(res, null, 'Compliance saved');
  } catch (error) { return handleError(res, error); }
};

export const getCompliance = async (req: AuthRequest, res: Response) => {
  try {
    const compliance = await outletContentService.getCompliance(req.params.outletId);
    return sendSuccess(res, compliance);
  } catch (error) { return handleError(res, error); }
};

export const updateOperatingHours = async (req: Request, res: Response) => {
  try {
    const { timezone, days } = req.body;
    if (!Array.isArray(days) || days.length === 0) return sendError(res, 'Days array is required', 'VALIDATION_ERROR', 400);
    await updateOperatingHoursFromEndpoint(req.params.outletId, timezone, days);
    return sendSuccess(res, null, 'Operating hours updated and synced successfully');
  } catch (error) { return handleError(res, error); }
};

export const uploadPhotoGallery = async (req: AuthRequest, res: Response) => {
  try {
    const { category, image, url, photoUrl, imageUrl } = req.body;
    const inputUrl = url || photoUrl || imageUrl || image;
    const finalUrl = await outletContentService.uploadPhotoGallery(req.params.outletId, category as any, inputUrl);
    return sendSuccess(res, { url: finalUrl, category }, 'Photo uploaded successfully');
  } catch (error) { return handleError(res, error); }
};

export const deletePhotoGallery = async (req: AuthRequest, res: Response) => {
  try {
    await outletContentService.deletePhotoGallery(req.params.outletId, req.body.category as any, req.body.photoUrl);
    return sendSuccess(res, null, 'Photo deleted successfully');
  } catch (error) { return handleError(res, error); }
};

export const getProfileOverview = async (req: Request, res: Response) => {
  try {
    const outlet = await outletService.getOutletById(req.params.outletId);
    if (!outlet) return sendError(res, 'Outlet not found', 'RESOURCE_NOT_FOUND', 404);
    const outletObj = (outlet as any).toObject ? (outlet as any).toObject() : outlet;
    const brand = outletObj.brand_id;

    return sendSuccess(res, {
      outletId: outletObj._id,
      name: outletObj.name,
      slug: outletObj.slug,
      coverImage: outletObj.media?.cover_image_url,
      cuisines: brand?.cuisines || [],
      openingStatus: 'OPEN',
      distanceKm: null,
      brand: brand ? {
        id: brand._id,
        name: brand.name,
        logo: brand.logo_url,
        is_branded: brand.is_branded,
        brand_theme: brand.brand_theme
      } : null,
      socials: [],
      menu_settings: outletObj.menu_settings,
      ordering_settings: outletObj.ordering_settings
    });
  } catch (error) { return handleError(res, error); }
};

export const getProfileAbout = async (req: Request, res: Response) => {
  try {
    const outlet = await outletService.getOutletById(req.params.outletId);
    if (!outlet) return sendError(res, 'Outlet not found', 'RESOURCE_NOT_FOUND', 404);
    return sendSuccess(res, { description: '', address: outlet.address, operatingHours: { timezone: outlet.timezone, days: [] }, amenities: [], otherOutlets: [] });
  } catch (error) { return handleError(res, error); }
};

export const getBrandOutlets = async (req: Request, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.brandId)) return sendError(res, 'Invalid brand ID', 'VALIDATION_ERROR', 400);
    const result = await outletDiscoveryService.getBrandOutlets(req.params.brandId, req.query.latitude as string, req.query.longitude as string, req.query.limit as string, req.query.excludeOutletId as string);
    return sendSuccess(res, result, `Found ${result.total} outlet(s) for this brand`);
  } catch (error) { return handleError(res, error); }
};

export const getNearbyOutlets = async (req: Request, res: Response) => {
  try {
    if (!req.query.latitude || !req.query.longitude) return sendError(res, 'Latitude and longitude are required', 'VALIDATION_ERROR', 400);
    const { latitude, longitude, radius, page, limit, cuisines, priceRange, minRating, sortBy, isVeg, search } = req.query;
    const result = await outletDiscoveryService.getNearbyOutlets(latitude as string, longitude as string, radius as string, parseInt(page as string), parseInt(limit as string), cuisines as string, priceRange as string, minRating as string, sortBy as any, isVeg as string, search as string);
    return sendSuccess(res, result);
  } catch (error) { return handleError(res, error); }
};

export const getFeaturedOutlets = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const outlets = await outletDiscoveryService.getFeaturedOutlets(limit);
    return sendSuccess(res, { outlets });
  } catch (error) { return handleError(res, error); }
};

export const toggleFeaturedStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const outlet = await outletContentService.toggleFeaturedStatus(req.params.outletId, req.body.isFeatured);
    return sendSuccess(res, { id: outlet._id, isFeatured: outlet.flags?.is_featured }, 'Featured status updated');
  } catch (error) { return handleError(res, error); }
};

export const addInstagramReel = async (req: AuthRequest, res: Response) => {
  try {
    const reel = await outletContentService.addInstagramReel(req.params.outletId, req.body.url, req.body.thumbnailUrl);
    return sendSuccess(res, { reel }, 'Reel added successfully');
  } catch (error) { return handleError(res, error); }
};

export const deleteInstagramReel = async (req: AuthRequest, res: Response) => {
  try {
    await outletContentService.deleteInstagramReel(req.params.outletId, req.params.reelId);
    return sendSuccess(res, null, 'Reel deleted successfully');
  } catch (error) { return handleError(res, error); }
};

export const reorderInstagramReels = async (req: AuthRequest, res: Response) => {
  try {
    await outletContentService.reorderInstagramReels(req.params.outletId, req.body.reelIds);
    return sendSuccess(res, null, 'Reels reordered successfully');
  } catch (error) { return handleError(res, error); }
};

export const updateInstagramReel = async (req: AuthRequest, res: Response) => {
  return sendSuccess(res, null, 'Reel updated successfully'); // Kept as stub matching original if not implemented yet
};

export const getMenuSettings = async (req: AuthRequest, res: Response) => {
  try {
    const outlet = await outletService.getOutletById(req.params.outletId);
    if (!outlet) return sendError(res, 'Outlet not found', 'RESOURCE_NOT_FOUND', 404);

    const outletObj = outlet.toObject ? outlet.toObject() : outlet;
    const settings = {
      ...(outletObj.menu_settings || {}),
      ordering_settings: outletObj.ordering_settings || {}
    };
    return sendSuccess(res, settings);
  } catch (error) { return handleError(res, error); }
};

export const updateMenuSettings = async (req: AuthRequest, res: Response) => {
  try {
    const payload = req.body;
    const ordering_settings = payload.ordering_settings;

    const menu_settings = { ...payload };
    delete menu_settings.ordering_settings;

    const updateData: any = {};
    if (Object.keys(menu_settings).length > 0) updateData.menu_settings = menu_settings;
    if (ordering_settings) updateData.ordering_settings = ordering_settings;

    const outlet = await outletService.updateOutlet(req.params.outletId, req.user!.id, updateData);

    const outletObj = outlet && (outlet as any).toObject ? (outlet as any).toObject() : outlet;
    const settings = {
      ...(outletObj?.menu_settings || {}),
      ordering_settings: outletObj?.ordering_settings || {}
    };

    return sendSuccess(res, settings, 'Settings updated');
  } catch (error) { return handleError(res, error); }
};
