import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware.js';
import { Offer } from '../models/Offer.js';
import { sendSuccess, sendError } from '../utils/response.js';

export const createOffer = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const {
            title,
            subtitle,
            description,
            offer_type,
            banner_image_url,
            badge_text,
            valid_from,
            valid_till,
            is_active
        } = req.body;

        if (!title) {
            return sendError(res, 'Title is required', null, 400);
        }

        const offer = await Offer.create({
            brand_id: req.outlet?.brand_id,
            created_by_user_id: req.user.id,
            created_by_role: req.user.activeRole?.role,
            outlet_ids: [outletId],
            title,
            subtitle,
            description,
            offer_type,
            banner_image_url,
            badge_text,
            valid_from: valid_from ? new Date(valid_from) : undefined,
            valid_till: valid_till ? new Date(valid_till) : undefined,
            is_active: is_active !== undefined ? is_active : true,
            approval_status: 'approved'
        } as any);

        return sendSuccess(res, {
            message: 'Offer created successfully',
            offer
        }, null, 201);
    } catch (error: any) {
        console.error('Create offer error:', error);
        return sendError(res, error.message);
    }
};

export const getOutletOffers = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const { is_active, page = 1, limit = 20 } = req.query;

        const filter: any = { outlet_ids: outletId };
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
        const { offerId } = req.params;

        const offer = await Offer.findById(offerId)
            .populate('brand_id', 'name')
            .populate('created_by_user_id', 'username phone')
            .lean();

        if (!offer) {
            return sendError(res, 'Offer not found', null, 404);
        }

        return sendSuccess(res, { offer });
    } catch (error: any) {
        console.error('Get offer error:', error);
        return sendError(res, error.message);
    }
};

export const updateOffer = async (req: AuthRequest, res: Response) => {
    try {
        const { offerId } = req.params;
        const {
            title,
            subtitle,
            description,
            offer_type,
            banner_image_url,
            badge_text,
            valid_from,
            valid_till,
            is_active
        } = req.body;

        const offer = await Offer.findById(offerId);

        if (!offer) {
            return sendError(res, 'Offer not found', null, 404);
        }

        if (title !== undefined) offer.title = title;
        if (subtitle !== undefined) offer.subtitle = subtitle;
        if (description !== undefined) offer.description = description;
        if (offer_type !== undefined) offer.offer_type = offer_type;
        if (banner_image_url !== undefined) offer.banner_image_url = banner_image_url;
        if (badge_text !== undefined) offer.badge_text = badge_text;
        if (valid_from !== undefined) offer.valid_from = new Date(valid_from);
        if (valid_till !== undefined) offer.valid_till = new Date(valid_till);
        if (is_active !== undefined) offer.is_active = is_active;

        await offer.save();

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
        const { offerId } = req.params;

        const offer = await Offer.findByIdAndDelete(offerId);

        if (!offer) {
            return sendError(res, 'Offer not found', null, 404);
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
        const { offerId } = req.params;

        const offer = await Offer.findById(offerId);

        if (!offer) {
            return sendError(res, 'Offer not found', null, 404);
        }

        (offer as any).is_active = !offer.is_active;
        await offer.save();

        return sendSuccess(res, {
            message: `Offer ${offer.is_active ? 'activated' : 'deactivated'} successfully`,
            offer
        });
    } catch (error: any) {
        console.error('Toggle offer status error:', error);
        return sendError(res, error.message);
    }
};
