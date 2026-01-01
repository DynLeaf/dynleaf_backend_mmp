import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware.js';
import { Outlet } from '../models/Outlet.js';
import { Subscription } from '../models/Subscription.js';
import { SUBSCRIPTION_FEATURES, getSubscriptionPlan, isUnlimited } from '../config/subscriptionPlans.js';

export const requireSubscriptionFeature = (feature: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const outletId = req.params.outletId || req.params.id || req.body.outlet_id;

            if (!outletId) {
                return res.status(400).json({ 
                    error: 'Outlet ID is required',
                    code: 'OUTLET_ID_MISSING'
                });
            }

            const outlet = await Outlet.findById(outletId);
            
            if (!outlet) {
                return res.status(404).json({ 
                    error: 'Outlet not found',
                    code: 'OUTLET_NOT_FOUND'
                });
            }

            if (!outlet.subscription_id) {
                return res.status(403).json({ 
                    error: 'No subscription found',
                    message: 'This outlet does not have an active subscription. Please contact admin.',
                    code: 'NO_SUBSCRIPTION',
                    requiredFeature: feature
                });
            }

            const subscription = await Subscription.findById(outlet.subscription_id);

            if (!subscription) {
                return res.status(403).json({ 
                    error: 'Subscription not found',
                    message: 'Subscription record not found. Please contact admin.',
                    code: 'SUBSCRIPTION_NOT_FOUND',
                    requiredFeature: feature
                });
            }

            if (subscription.status !== 'active' && subscription.status !== 'trial') {
                return res.status(403).json({ 
                    error: 'Subscription inactive',
                    message: `Subscription status is ${subscription.status}. Please contact admin.`,
                    code: 'SUBSCRIPTION_INACTIVE',
                    subscriptionStatus: subscription.status,
                    requiredFeature: feature
                });
            }

            if (!subscription.features.includes(feature)) {
                const plan = getSubscriptionPlan(subscription.plan);
                return res.status(403).json({ 
                    error: 'Feature not available',
                    message: `Your ${plan?.displayName || subscription.plan} plan does not include ${feature}`,
                    code: 'FEATURE_NOT_AVAILABLE',
                    currentPlan: subscription.plan,
                    requiredFeature: feature
                });
            }

            if (subscription.end_date && new Date() > subscription.end_date) {
                subscription.status = 'expired';
                await subscription.save();
                
                return res.status(403).json({ 
                    error: 'Subscription expired',
                    message: 'Your subscription has expired. Please contact admin to renew.',
                    code: 'SUBSCRIPTION_EXPIRED',
                    expiredAt: subscription.end_date
                });
            }

            if (subscription.status === 'trial' && subscription.trial_ends_at) {
                if (new Date() > subscription.trial_ends_at) {
                    subscription.status = 'expired';
                    await subscription.save();
                    
                    return res.status(403).json({ 
                        error: 'Trial expired',
                        message: 'Your trial period has ended. Please contact admin to activate a subscription.',
                        code: 'TRIAL_EXPIRED',
                        expiredAt: subscription.trial_ends_at
                    });
                }
            }

            req.outlet = outlet;
            req.subscription = subscription;
            next();
        } catch (error: any) {
            console.error('Subscription middleware error:', error);
            return res.status(500).json({ 
                error: 'Server error',
                message: 'Failed to verify subscription',
                code: 'SUBSCRIPTION_CHECK_ERROR'
            });
        }
    };
};

export const checkFeatureLimit = (limitKey: 'offers' | 'menu_items' | 'photo_gallery' | 'staff_accounts') => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const outlet = req.outlet;
            const subscription = req.subscription;
            
            if (!outlet || !subscription) {
                return res.status(403).json({ 
                    error: 'Subscription required',
                    code: 'NO_SUBSCRIPTION'
                });
            }

            const plan = getSubscriptionPlan(subscription.plan);
            
            if (!plan) {
                return res.status(500).json({ 
                    error: 'Invalid subscription plan',
                    code: 'INVALID_PLAN'
                });
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
                return res.status(403).json({ 
                    error: 'Limit reached',
                    message: `Your ${plan.displayName} plan allows up to ${limit} ${limitKey.replace('_', ' ')}. You have reached this limit.`,
                    code: 'LIMIT_REACHED',
                    limit,
                    current: currentCount,
                    limitType: limitKey
                });
            }

            next();
        } catch (error: any) {
            console.error('Feature limit check error:', error);
            return res.status(500).json({ 
                error: 'Server error',
                message: 'Failed to check feature limit',
                code: 'LIMIT_CHECK_ERROR'
            });
        }
    };
};

export const requireActiveSubscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const outletId = req.params.outletId || req.params.id || req.body.outlet_id;

        if (!outletId) {
            return res.status(400).json({ 
                error: 'Outlet ID is required',
                code: 'OUTLET_ID_MISSING'
            });
        }

        const outlet = await Outlet.findById(outletId);
        
        if (!outlet) {
            return res.status(404).json({ 
                error: 'Outlet not found',
                code: 'OUTLET_NOT_FOUND'
            });
        }

        if (!outlet.subscription_id) {
            return res.status(403).json({ 
                error: 'Active subscription required',
                message: 'This feature requires an active subscription',
                code: 'SUBSCRIPTION_REQUIRED',
                currentStatus: 'none'
            });
        }

        const subscription = await Subscription.findById(outlet.subscription_id);

        if (!subscription || (subscription.status !== 'active' && subscription.status !== 'trial')) {
            return res.status(403).json({ 
                error: 'Active subscription required',
                message: 'This feature requires an active subscription',
                code: 'SUBSCRIPTION_REQUIRED',
                currentStatus: subscription?.status || 'none'
            });
        }

        req.outlet = outlet;
        req.subscription = subscription;
        next();
    } catch (error: any) {
        console.error('Active subscription check error:', error);
        return res.status(500).json({ 
            error: 'Server error',
            code: 'SUBSCRIPTION_CHECK_ERROR'
        });
    }
};
