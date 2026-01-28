import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware.js';
import { Outlet } from '../models/Outlet.js';
import { Subscription } from '../models/Subscription.js';
import { SUBSCRIPTION_FEATURES, getSubscriptionPlan, isUnlimited } from '../config/subscriptionPlans.js';
import { sendError, ErrorCode } from '../utils/response.js';

export const requireSubscriptionFeature = (feature: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const outletId = req.params.outletId || req.params.id || req.body.outlet_id;

            if (!outletId) {
                return sendError(
                    res,
                    'Outlet ID is required',
                    'OUTLET_ID_MISSING',
                    400
                );
            }

            const outlet = await Outlet.findById(outletId);
            
            if (!outlet) {
                return sendError(
                    res,
                    'Outlet not found',
                    ErrorCode.OUTLET_NOT_FOUND,
                    404
                );
            }

            if (!outlet.subscription_id) {
                return sendError(
                    res,
                    'This outlet does not have an active subscription. Please contact admin.',
                    'NO_SUBSCRIPTION',
                    403
                );
            }

            const subscription = await Subscription.findById(outlet.subscription_id);

            if (!subscription) {
                return sendError(
                    res,
                    'Subscription record not found. Please contact admin.',
                    'SUBSCRIPTION_NOT_FOUND',
                    403
                );
            }

            if (subscription.status !== 'active' && subscription.status !== 'trial') {
                return sendError(
                    res,
                    `Subscription status is ${subscription.status}. Please contact admin.`,
                    'SUBSCRIPTION_INACTIVE',
                    403
                );
            }

            if (!subscription.features.includes(feature)) {
                const plan = getSubscriptionPlan(subscription.plan);
                return sendError(
                    res,
                    `Your ${plan?.displayName || subscription.plan} plan does not include ${feature}`,
                    'FEATURE_NOT_AVAILABLE',
                    403
                );
            }

            if (subscription.end_date && new Date() > subscription.end_date) {
                subscription.status = 'expired';
                await subscription.save();
                
                return sendError(
                    res,
                    'Your subscription has expired. Please contact admin to renew.',
                    'SUBSCRIPTION_EXPIRED',
                    403
                );
            }

            if (subscription.status === 'trial' && subscription.trial_ends_at) {
                if (new Date() > subscription.trial_ends_at) {
                    subscription.status = 'expired';
                    await subscription.save();
                    
                    return sendError(
                        res,
                        'Your trial period has ended. Please contact admin to activate a subscription.',
                        'TRIAL_EXPIRED',
                        403
                    );
                }
            }

            req.outlet = outlet;
            req.subscription = subscription;
            next();
        } catch (error: any) {
            console.error('Subscription middleware error:', error);
            return sendError(
                res,
                'Failed to verify subscription',
                'SUBSCRIPTION_CHECK_ERROR',
                500
            );
        }
    };
};

export const checkFeatureLimit = (limitKey: 'offers' | 'menu_items' | 'photo_gallery' | 'staff_accounts') => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const outlet = req.outlet;
            const subscription = req.subscription;
            
            if (!outlet || !subscription) {
                return sendError(
                    res,
                    'Subscription required to access this feature',
                    'SUBSCRIPTION_REQUIRED',
                    403
                );
            }

            const plan = getSubscriptionPlan(subscription.plan);
            
            if (!plan) {
                return sendError(
                    res,
                    'Invalid subscription plan',
                    'INVALID_PLAN',
                    500
                );
            }

            const limit = plan.limits[limitKey];

            if (isUnlimited(limit)) {
                return next();
            }

            let currentCount = 0;

            switch (limitKey) {
                case 'offers':
                    const { Offer } = await import('../models/Offer.js');
                    currentCount = await Offer.countDocuments({ 
                        outlet_ids: outlet._id,
                        is_active: true 
                    } as any);
                    break;
                
                case 'menu_items':
                    const { OutletMenuItem } = await import('../models/OutletMenuItem.js');
                    currentCount = await OutletMenuItem.countDocuments({ 
                        outlet_id: outlet._id,
                        is_available: true 
                    });
                    break;
                
                case 'photo_gallery':
                    const interiorCount = outlet.photo_gallery?.interior?.length || 0;
                    const exteriorCount = outlet.photo_gallery?.exterior?.length || 0;
                    const foodCount = outlet.photo_gallery?.food?.length || 0;
                    currentCount = interiorCount + exteriorCount + foodCount;
                    break;
                
                case 'staff_accounts':
                    currentCount = outlet.managers?.length || 0;
                    break;
            }

            if (currentCount >= limit) {
                return sendError(
                    res,
                    `Your ${plan.displayName} plan allows up to ${limit} ${limitKey.replace('_', ' ')}. You have reached this limit.`,
                    'LIMIT_REACHED',
                    403
                );
            }

            next();
        } catch (error: any) {
            console.error('Feature limit check error:', error);
            return sendError(
                res,
                'Failed to check feature limit',
                'LIMIT_CHECK_ERROR',
                500
            );
        }
    };
};

export const requireActiveSubscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const outletId = req.params.outletId || req.params.id || req.body.outlet_id;

        if (!outletId) {
            return sendError(
                res,
                'Outlet ID is required',
                'OUTLET_ID_MISSING',
                400
            );
        }

        const outlet = await Outlet.findById(outletId);
        
        if (!outlet) {
            return sendError(
                res,
                'Outlet not found',
                ErrorCode.OUTLET_NOT_FOUND,
                404
            );
        }

        if (!outlet.subscription_id) {
            return sendError(
                res,
                'This feature requires an active subscription',
                'SUBSCRIPTION_REQUIRED',
                403
            );
        }

        const subscription = await Subscription.findById(outlet.subscription_id);

        if (!subscription || (subscription.status !== 'active' && subscription.status !== 'trial')) {
            return sendError(
                res,
                'This feature requires an active subscription',
                'SUBSCRIPTION_REQUIRED',
                403
            );
        }

        req.outlet = outlet;
        req.subscription = subscription;
        next();
    } catch (error: any) {
        console.error('Active subscription check error:', error);
        return sendError(
            res,
            'Failed to check subscription status',
            'SUBSCRIPTION_CHECK_ERROR',
            500
        );
    }
};
