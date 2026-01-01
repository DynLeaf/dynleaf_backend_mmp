import { Request, Response } from 'express';
import { FeaturedPromotion } from '../models/FeaturedPromotion.js';
import { Outlet } from '../models/Outlet.js';
import { sendSuccess, sendError } from '../utils/response.js';

// Create a new promotion
export const createPromotion = async (req: Request, res: Response) => {
    try {
        const {
            outlet_id,
            promotion_type,
            display_data,
            scheduling,
            targeting,
            payment
        } = req.body;

        // Validate outlet exists
        const outlet = await Outlet.findById(outlet_id);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // Check for overlapping active promotions for the same outlet
        const overlapping = await FeaturedPromotion.findOne({
            outlet_id,
            is_active: true,
            $or: [
                {
                    'scheduling.start_date': { $lte: scheduling.end_date },
                    'scheduling.end_date': { $gte: scheduling.start_date }
                }
            ]
        });

        if (overlapping) {
            return sendError(res, 'Outlet already has an active promotion during this period', 400);
        }

        const promotion = await FeaturedPromotion.create({
            outlet_id,
            promotion_type: promotion_type || 'featured_today',
            display_data: {
                title: display_data.title,
                subtitle: display_data.subtitle,
                banner_image_url: display_data.banner_image_url,
                badge_text: display_data.badge_text || 'Sponsored'
            },
            scheduling: {
                start_date: new Date(scheduling.start_date),
                end_date: new Date(scheduling.end_date),
                display_priority: scheduling.display_priority || 50
            },
            targeting: {
                locations: targeting?.locations || [],
                show_on_homepage: targeting?.show_on_homepage !== false
            },
            payment: payment ? {
                amount_paid: payment.amount_paid || 0,
                payment_status: payment.payment_status || 'pending',
                payment_date: payment.payment_date ? new Date(payment.payment_date) : undefined
            } : undefined,
            is_active: true,
            created_by: outlet.created_by_user_id // Use the outlet owner as creator
        });

        const populatedPromotion = await FeaturedPromotion.findById(promotion._id)
            .populate('outlet_id', 'name slug logo_url address')
            .populate('created_by', 'username email');

        return sendSuccess(res, {
            promotion: populatedPromotion
        }, 201);
    } catch (error: any) {
        console.error('Create promotion error:', error);
        return sendError(res, error.message || 'Failed to create promotion');
    }
};

// Get all promotions (with filters)
export const getPromotions = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;
        
        const status = req.query.status as string; // 'active', 'scheduled', 'expired', 'inactive'
        const outlet_id = req.query.outlet_id as string;

        const query: any = {};

        // Filter by outlet
        if (outlet_id) {
            query.outlet_id = outlet_id;
        }

        // Filter by status
        const now = new Date();
        if (status === 'active') {
            query.is_active = true;
            query['scheduling.start_date'] = { $lte: now };
            query['scheduling.end_date'] = { $gte: now };
        } else if (status === 'scheduled') {
            query.is_active = true;
            query['scheduling.start_date'] = { $gt: now };
        } else if (status === 'expired') {
            query['scheduling.end_date'] = { $lt: now };
        } else if (status === 'inactive') {
            query.is_active = false;
        }

        const [promotions, total] = await Promise.all([
            FeaturedPromotion.find(query)
                .populate('outlet_id', 'name slug logo_url address')
                .populate('created_by', 'username email')
                .sort({ 'scheduling.display_priority': -1, created_at: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            FeaturedPromotion.countDocuments(query)
        ]);

        return sendSuccess(res, {
            promotions,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error: any) {
        console.error('Get promotions error:', error);
        return sendError(res, error.message || 'Failed to fetch promotions');
    }
};

// Get single promotion
export const getPromotion = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const promotion = await FeaturedPromotion.findById(id)
            .populate('outlet_id', 'name slug logo_url address contact')
            .populate('created_by', 'username email');

        if (!promotion) {
            return sendError(res, 'Promotion not found', 404);
        }

        return sendSuccess(res, { promotion });
    } catch (error: any) {
        console.error('Get promotion error:', error);
        return sendError(res, error.message || 'Failed to fetch promotion');
    }
};

// Update promotion
export const updatePromotion = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const promotion = await FeaturedPromotion.findById(id);
        if (!promotion) {
            return sendError(res, 'Promotion not found', 404);
        }

        // If updating scheduling, check for overlaps
        if (updates.scheduling) {
            const overlapping = await FeaturedPromotion.findOne({
                _id: { $ne: id },
                outlet_id: promotion.outlet_id,
                is_active: true,
                $or: [
                    {
                        'scheduling.start_date': { $lte: new Date(updates.scheduling.end_date) },
                        'scheduling.end_date': { $gte: new Date(updates.scheduling.start_date) }
                    }
                ]
            });

            if (overlapping) {
                return sendError(res, 'Scheduling conflict with another active promotion', 400);
            }
        }

        // Update fields
        if (updates.display_data) {
            promotion.display_data = { ...promotion.display_data, ...updates.display_data };
        }
        if (updates.scheduling) {
            promotion.scheduling = { ...promotion.scheduling, ...updates.scheduling };
        }
        if (updates.targeting) {
            promotion.targeting = { ...promotion.targeting, ...updates.targeting };
        }
        if (updates.payment) {
            promotion.payment = { ...promotion.payment, ...updates.payment };
        }
        if (updates.promotion_type !== undefined) {
            promotion.promotion_type = updates.promotion_type;
        }
        if (updates.is_active !== undefined) {
            promotion.is_active = updates.is_active;
        }

        await promotion.save();

        const updatedPromotion = await FeaturedPromotion.findById(id)
            .populate('outlet_id', 'name slug logo_url address')
            .populate('created_by', 'username email');

        return sendSuccess(res, { promotion: updatedPromotion });
    } catch (error: any) {
        console.error('Update promotion error:', error);
        return sendError(res, error.message || 'Failed to update promotion');
    }
};

// Toggle promotion status
export const togglePromotionStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const promotion = await FeaturedPromotion.findById(id);
        if (!promotion) {
            return sendError(res, 'Promotion not found', 404);
        }

        promotion.is_active = !promotion.is_active;
        await promotion.save();

        return sendSuccess(res, {
            promotion,
            message: `Promotion ${promotion.is_active ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error: any) {
        console.error('Toggle promotion status error:', error);
        return sendError(res, error.message || 'Failed to toggle promotion status');
    }
};

// Delete promotion
export const deletePromotion = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const promotion = await FeaturedPromotion.findByIdAndDelete(id);
        if (!promotion) {
            return sendError(res, 'Promotion not found', 404);
        }

        return sendSuccess(res, { message: 'Promotion deleted successfully' });
    } catch (error: any) {
        console.error('Delete promotion error:', error);
        return sendError(res, error.message || 'Failed to delete promotion');
    }
};

// Get promotion analytics
export const getPromotionAnalytics = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const promotion = await FeaturedPromotion.findById(id)
            .populate('outlet_id', 'name slug');

        if (!promotion) {
            return sendError(res, 'Promotion not found', 404);
        }

        const ctr = promotion.analytics.impressions > 0
            ? ((promotion.analytics.clicks / promotion.analytics.impressions) * 100).toFixed(2)
            : 0;

        return sendSuccess(res, {
            analytics: {
                ...promotion.analytics.toObject(),
                ctr: parseFloat(ctr as string)
            },
            outlet: promotion.outlet_id
        });
    } catch (error: any) {
        console.error('Get promotion analytics error:', error);
        return sendError(res, error.message || 'Failed to fetch analytics');
    }
};

// Track impression (public endpoint)
export const trackImpression = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await FeaturedPromotion.findByIdAndUpdate(
            id,
            { $inc: { 'analytics.impressions': 1 } },
            { new: true }
        );

        return sendSuccess(res, { message: 'Impression tracked' });
    } catch (error: any) {
        console.error('Track impression error:', error);
        return sendError(res, error.message || 'Failed to track impression');
    }
};

// Track click (public endpoint)
export const trackClick = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const promotion = await FeaturedPromotion.findByIdAndUpdate(
            id,
            { $inc: { 'analytics.clicks': 1 } },
            { new: true }
        );

        if (promotion && promotion.analytics.impressions > 0) {
            promotion.analytics.conversion_rate = 
                (promotion.analytics.clicks / promotion.analytics.impressions) * 100;
            await promotion.save();
        }

        return sendSuccess(res, { message: 'Click tracked' });
    } catch (error: any) {
        console.error('Track click error:', error);
        return sendError(res, error.message || 'Failed to track click');
    }
};

// Get active featured promotions for homepage (public)
export const getFeaturedPromotions = async (req: Request, res: Response) => {
    try {
        const location = req.query.location as string;
        const limit = parseInt(req.query.limit as string) || 5;

        const now = new Date();
        const query: any = {
            is_active: true,
            'scheduling.start_date': { $lte: now },
            'scheduling.end_date': { $gte: now },
            'targeting.show_on_homepage': true
        };

        // Filter by location if provided
        if (location) {
            query.$or = [
                { 'targeting.locations': { $size: 0 } }, // No location targeting
                { 'targeting.locations': location } // Matches location
            ];
        }

        const promotions = await FeaturedPromotion.find(query)
            .populate({
                path: 'outlet_id',
                select: 'name slug logo_url address location cuisines price_range avg_rating is_pure_veg',
                populate: {
                    path: 'brand_id',
                    select: 'name logo_url'
                }
            })
            .sort({ 'scheduling.display_priority': -1 })
            .limit(limit)
            .lean();

        return sendSuccess(res, { promotions });
    } catch (error: any) {
        console.error('Get featured promotions error:', error);
        return sendError(res, error.message || 'Failed to fetch featured promotions');
    }
};
