import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware.js';
import { Offer } from '../models/Offer.js';
import { Outlet } from '../models/Outlet.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { notifyFollowersOfNewOffer } from '../services/notificationService.js';
import * as outletService from '../services/outletService.js';

// Constants
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const DEFAULT_RADIUS = 50000;
const STATUS_CODE_NOT_FOUND = 404;
const STATUS_CODE_BAD_REQUEST = 400;

export const createOffer = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const {
            title,
            subtitle,
            description,
            offer_type,
            banner_image_url,
            background_image_url,
            badge_text,
            code,
            terms,
            discount_percentage,
            discount_amount,
            max_discount_amount,
            min_order_amount,
            applicable_category_ids,
            applicable_food_item_ids,
            days_of_week,
            time_from,
            time_to,
            valid_from,
            valid_till,
            show_on_menu,
            display_order,
            is_active
        } = req.body;

        if (!title) {
            return sendError(res, 'Title is required', null, STATUS_CODE_BAD_REQUEST);
        }

        const outlet = req.outlet || await outletService.getOutletById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, STATUS_CODE_NOT_FOUND);
        }

        const actualOutletId = outlet._id;

        const offer = await Offer.create({
            brand_id: outlet.brand_id,
            created_by_user_id: req.user.id,
            created_by_role: req.user.activeRole?.role,
            outlet_ids: [actualOutletId],
            location: outlet.location,
            title,
            subtitle,
            description,
            offer_type,
            banner_image_url,
            background_image_url,
            badge_text,
            code,
            terms,
            discount_percentage,
            discount_amount,
            max_discount_amount,
            min_order_amount,
            applicable_category_ids,
            applicable_food_item_ids,
            days_of_week,
            time_from,
            time_to,
            valid_from: valid_from ? new Date(valid_from) : undefined,
            valid_till: valid_till ? new Date(valid_till) : undefined,
            show_on_menu: show_on_menu !== undefined ? show_on_menu : true,
            display_order: display_order || 0,
            is_active: is_active !== undefined ? is_active : true,
            approval_status: 'approved'
        } as any);

        const createdOffer = Array.isArray(offer) ? offer[0] : offer;

        // Notify followers asynchronously (don't wait for it to finish to send response)
        notifyFollowersOfNewOffer((createdOffer as any)._id as string, actualOutletId.toString())
            .catch(err => console.error('[OfferController] Notification error:', err));

        return sendSuccess(res, {
            message: 'Offer created successfully',
            offer: createdOffer
        }, null, 201);
    } catch (error: any) {
        console.error('Create offer error:', error);
        return sendError(res, error.message);
    }
};

export const getOutletOffers = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const { is_active, page = DEFAULT_PAGE, limit = DEFAULT_LIMIT } = req.query;

        const outlet = await outletService.getOutletById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, STATUS_CODE_NOT_FOUND);
        }
        const actualOutletId = outlet._id;

        const filter: any = { outlet_ids: actualOutletId };
        if (is_active !== undefined) {
            filter.is_active = is_active === 'true';
        }

        const skip = (Number(page) - 1) * Number(limit);

        const offers = await Offer.find(filter)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean();

        const total = await Offer.countDocuments(filter);

        return sendSuccess(res, {
            offers,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error: any) {
        console.error('Get outlet offers error:', error);
        return sendError(res, error.message);
    }
};

export const getOfferById = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId, offerId } = req.params;

        const outlet = await outletService.getOutletById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, STATUS_CODE_NOT_FOUND);
        }
        const actualOutletId = outlet._id;

        const offer = await Offer.findOne({ _id: offerId, outlet_ids: actualOutletId as any })
            .populate('brand_id', 'name')
            .populate('created_by_user_id', 'username phone')
            .lean();

        if (!offer) {
            return sendError(res, 'Offer not found', null, STATUS_CODE_NOT_FOUND);
        }

        return sendSuccess(res, { offer });
    } catch (error: any) {
        console.error('Get offer error:', error);
        return sendError(res, error.message);
    }
};

// Get offer by ID directly (for sharing/direct links)
export const getOfferByIdDirect = async (req: AuthRequest, res: Response) => {
    try {
        const { offerId } = req.params;

        const offer = await Offer.findOne({ _id: offerId })
            .populate('brand_id', 'name logo_url')
            .populate('outlet_ids', 'name slug location')
            .lean();

        if (!offer) {
            return sendError(res, 'Offer not found', null, STATUS_CODE_NOT_FOUND);
        }

        // If offer has multiple outlets, just return the first one as primary
        const primaryOutlet = Array.isArray((offer as any).outlet_ids) 
            ? (offer as any).outlet_ids[0] 
            : (offer as any).outlet_ids;

        return sendSuccess(res, { 
            offer: {
                ...offer,
                outlet: primaryOutlet,
                brand: (offer as any).brand_id
            }
        });
    } catch (error: any) {
        console.error('Get offer by ID direct error:', error);
        return sendError(res, error.message);
    }
};

export const updateOffer = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId, offerId } = req.params;
        const {
            title,
            subtitle,
            description,
            offer_type,
            banner_image_url,
            background_image_url,
            badge_text,
            code,
            terms,
            discount_percentage,
            discount_amount,
            max_discount_amount,
            min_order_amount,
            applicable_category_ids,
            applicable_food_item_ids,
            days_of_week,
            time_from,
            time_to,
            valid_from,
            valid_till,
            show_on_menu,
            display_order,
            is_active
        } = req.body;

        const outlet = await outletService.getOutletById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, STATUS_CODE_NOT_FOUND);
        }
        const actualOutletId = outlet._id;

        const offer = await Offer.findOne({ _id: offerId, outlet_ids: actualOutletId as any });

        if (!offer) {
            return sendError(res, 'Offer not found', null, STATUS_CODE_NOT_FOUND);
        }

        if (title !== undefined) offer.title = title;
        if (subtitle !== undefined) offer.subtitle = subtitle;
        if (description !== undefined) offer.description = description;
        if (offer_type !== undefined) offer.offer_type = offer_type;
        if (banner_image_url !== undefined) offer.banner_image_url = banner_image_url;
        if (background_image_url !== undefined) offer.background_image_url = background_image_url;
        if (badge_text !== undefined) offer.badge_text = badge_text;
        if (code !== undefined) offer.code = code;
        if (terms !== undefined) offer.terms = terms;
        if (discount_percentage !== undefined) offer.discount_percentage = discount_percentage;
        if (discount_amount !== undefined) offer.discount_amount = discount_amount;
        if (max_discount_amount !== undefined) offer.max_discount_amount = max_discount_amount;
        if (min_order_amount !== undefined) offer.min_order_amount = min_order_amount;
        if (applicable_category_ids !== undefined) offer.applicable_category_ids = applicable_category_ids;
        if (applicable_food_item_ids !== undefined) offer.applicable_food_item_ids = applicable_food_item_ids;
        if (days_of_week !== undefined) offer.days_of_week = days_of_week;
        if (time_from !== undefined) offer.time_from = time_from;
        if (time_to !== undefined) offer.time_to = time_to;
        if (valid_from !== undefined) offer.valid_from = new Date(valid_from);
        if (valid_till !== undefined) offer.valid_till = new Date(valid_till);
        if (show_on_menu !== undefined) offer.show_on_menu = show_on_menu;
        if (display_order !== undefined) offer.display_order = display_order;
        if (is_active !== undefined) offer.is_active = is_active;

        await (offer as any).save();

        return sendSuccess(res, {
            message: 'Offer updated successfully',
            offer
        });
    } catch (error: any) {
        console.error('Update offer error:', error);
        return sendError(res, error.message);
    }
};

export const deleteOffer = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId, offerId } = req.params;

        const outlet = await outletService.getOutletById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, STATUS_CODE_NOT_FOUND);
        }
        const actualOutletId = outlet._id;

        const offer = await Offer.findOneAndDelete({ _id: offerId, outlet_ids: actualOutletId as any });

        if (!offer) {
            return sendError(res, 'Offer not found', null, STATUS_CODE_NOT_FOUND);
        }

        return sendSuccess(res, {
            message: 'Offer deleted successfully'
        });
    } catch (error: any) {
        console.error('Delete offer error:', error);
        return sendError(res, error.message);
    }
};

export const toggleOfferStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId, offerId } = req.params;

        const outlet = await outletService.getOutletById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, STATUS_CODE_NOT_FOUND);
        }
        const actualOutletId = outlet._id;

        const offer = await Offer.findOne({ _id: offerId, outlet_ids: actualOutletId as any });

        if (!offer) {
            return sendError(res, 'Offer not found', null, STATUS_CODE_NOT_FOUND);
        }

        (offer as any).is_active = !offer.is_active;
        await (offer as any).save();

        return sendSuccess(res, {
            message: `Offer ${offer.is_active ? 'activated' : 'deactivated'} successfully`,
            offer
        });
    } catch (error: any) {
        console.error('Toggle offer status error:', error);
        return sendError(res, error.message);
    }
};

export const getNearbyOffers = async (req: any, res: Response) => {
    try {
        const { latitude, longitude, radius = DEFAULT_RADIUS, limit = DEFAULT_LIMIT } = req.query;

        if (!latitude || !longitude) {
            return sendError(res, 'Latitude and longitude are required', null, STATUS_CODE_BAD_REQUEST);
        }

        const lat = parseFloat(latitude as string);
        const lng = parseFloat(longitude as string);
        const radiusNum = parseInt(radius as string);
        const limitNum = parseInt(limit as string);

        const now = new Date(); // Filter for currently valid offers

        const pipeline: any[] = [
            {
                $geoNear: {
                    near: { type: 'Point', coordinates: [lng, lat] },
                    distanceField: 'distance',
                    maxDistance: radiusNum,
                    spherical: true,
                    query: {
                        is_active: true,
                        valid_from: { $lte: now },
                        valid_till: { $gte: now }
                    }
                }
            },
            {
                $lookup: {
                    from: 'outlets',
                    localField: 'outlet_ids',
                    foreignField: '_id',
                    as: 'outlet_details'
                }
            },
            {
                $lookup: {
                    from: 'brands',
                    localField: 'brand_id',
                    foreignField: '_id',
                    as: 'brand_details'
                }
            },
            { $unwind: { path: '$brand_details', preserveNullAndEmptyArrays: true } },
            { $limit: limitNum },
            {
                $project: {
                    _id: 1,
                    title: 1,
                    subtitle: 1,
                    description: 1,
                    offer_type: 1,
                    banner_image_url: 1,
                    discount_percentage: 1,
                    discount_amount: 1,
                    valid_till: 1,
                    code: 1,
                    distance: { $round: ['$distance', 0] },
                    outlet: { $arrayElemAt: ['$outlet_details', 0] },
                    brand: {
                        _id: '$brand_details._id',
                        name: '$brand_details.name',
                        logo_url: '$brand_details.logo_url'
                    }
                }
            }
        ];

        const offers = await Offer.aggregate(pipeline);
        console.log(`Found ${offers.length} nearby offers for [${lng}, ${lat}]`);
        if (offers.length === 0) {
            // Check if any active offers exist at all
            const totalActive = await Offer.countDocuments({ is_active: true } as any);
            const totalWithLoc = await Offer.countDocuments({ 'location.coordinates': { $exists: true } } as any);
            console.log(`Total active: ${totalActive}, Total with location: ${totalWithLoc}`);
        }

        return sendSuccess(res, {
            offers,
            metadata: {
                total: offers.length,
                search_radius_km: radiusNum / 1000,
                center: { latitude: lat, longitude: lng }
            }
        });
    } catch (error: any) {
        console.error('Get nearby offers error:', error);
        return sendError(res, error.message);
    }
};
