import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware.js';
import { Subscription, SubscriptionHistory } from '../models/Subscription.js';
import { Outlet } from '../models/Outlet.js';
import * as subscriptionUtils from '../utils/subscriptionUtils.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { normalizePlanToTier } from '../config/subscriptionPlans.js';

const normalizePlanKey = (plan?: string) => (normalizePlanToTier(plan) === 'premium' ? 'premium' : 'free');

export const assignSubscription = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const { plan, status, start_date, end_date, trial_ends_at, notes } = req.body;

        if (!plan || !status) {
            return sendError(res, 'Plan and status are required', null, 400);
        }

        if (status === 'cancelled') {
            return sendError(
                res,
                "Status 'cancelled' is deprecated. Use the cancel action to downgrade to Free.",
                null,
                400
            );
        }

        const assignmentData: any = {
            plan: normalizePlanKey(plan),
            status,
            start_date: start_date ? new Date(start_date) : undefined,
            end_date: end_date ? new Date(end_date) : undefined,
            trial_ends_at: trial_ends_at ? new Date(trial_ends_at) : undefined,
            notes
        };

        if (req.user.id && req.user.id !== 'admin') {
            assignmentData.assigned_by = req.user.id;
        }

        const subscription = await subscriptionUtils.assignSubscriptionToOutlet(outletId, assignmentData);

        return sendSuccess(res, {
            message: 'Subscription assigned successfully',
            subscription
        });
    } catch (error: any) {
        console.error('Assign subscription error:', error);
        return sendError(res, error.message);
    }
};

export const updateSubscription = async (req: AuthRequest, res: Response) => {
    try {
        const { subscriptionId } = req.params;
        const { plan, status, end_date, notes, auto_renew, payment_status } = req.body;

        let subscription = await Subscription.findById(subscriptionId).populate('outlet_id');
        
        if (!subscription) {
            return sendError(res, 'Subscription not found', null, 404);
        }

        // Validate outlet approval for plan changes
        if (plan) {
            const outlet = subscription.outlet_id as any;
            if (outlet && outlet.approval_status !== 'APPROVED') {
                return sendError(
                    res,
                    'Cannot change subscription plan for non-approved outlets. Please approve the outlet first.',
                    null,
                    403
                );
            }
        }

        let didExternalUpdate = false;

        if (plan) {
            const currentPlan = normalizePlanKey(subscription.plan);
            const nextPlan = normalizePlanKey(plan);
            if (nextPlan !== currentPlan) {
                await subscriptionUtils.upgradeSubscriptionPlan(subscriptionId, nextPlan as any, req.user.id);
                didExternalUpdate = true;
            }
        }

        if (status === 'cancelled') {
            return sendError(
                res,
                "Status 'cancelled' is deprecated. Use the cancel action to downgrade to Free.",
                null,
                400
            );
        }

        if (status && status !== subscription.status) {
            await subscriptionUtils.updateSubscriptionStatus(subscriptionId, status, req.user.id, notes);
            didExternalUpdate = true;
        }

        if (didExternalUpdate) {
            subscription = await Subscription.findById(subscriptionId);
            if (!subscription) {
                return sendError(res, 'Subscription not found', null, 404);
            }
        }

        if (end_date !== undefined) {
            subscription.end_date = end_date ? new Date(end_date) : undefined;
        }

        if (notes !== undefined) {
            subscription.notes = notes;
        }

        if (auto_renew !== undefined) {
            subscription.auto_renew = auto_renew;
        }

        if (payment_status !== undefined) {
            subscription.payment_status = payment_status;
        }

        await subscription.save();

        const updatedSubscription = await Subscription.findById(subscriptionId)
            .populate('outlet_id', 'name slug')
            .populate('brand_id', 'name')
            .populate('assigned_by', 'username phone');

        const subscriptionPayload = updatedSubscription
            ? ({
                  ...(updatedSubscription.toObject() as any),
                  plan: normalizePlanKey((updatedSubscription as any).plan),
              } as any)
            : updatedSubscription;

        return sendSuccess(res, {
            message: 'Subscription updated successfully',
            subscription: subscriptionPayload
        });
    } catch (error: any) {
        console.error('Update subscription error:', error);
        return sendError(res, error.message);
    }
};

export const extendSubscription = async (req: AuthRequest, res: Response) => {
    try {
        const { subscriptionId } = req.params;
        const { additional_months, additional_days } = req.body;

        const hasMonths = typeof additional_months === 'number' && Number.isFinite(additional_months) && additional_months > 0;
        const hasDays = typeof additional_days === 'number' && Number.isFinite(additional_days) && additional_days > 0;

        if (!hasMonths && !hasDays) {
            return sendError(res, 'Valid additional_months (preferred) or additional_days is required', null, 400);
        }

        const subscription = await subscriptionUtils.extendSubscription(
            subscriptionId,
            {
                additional_months: hasMonths ? Math.floor(additional_months) : undefined,
                additional_days: !hasMonths && hasDays ? Math.floor(additional_days) : undefined,
            },
            req.user.id
        );

        const message = hasMonths
            ? `Subscription extended by ${Math.floor(additional_months)} month(s)`
            : `Subscription extended by ${Math.floor(additional_days)} day(s)`;

        return sendSuccess(res, {
            message,
            subscription
        });
    } catch (error: any) {
        console.error('Extend subscription error:', error);
        return sendError(res, error.message);
    }
};

export const cancelSubscription = async (req: AuthRequest, res: Response) => {
    try {
        const { subscriptionId } = req.params;
        const { reason } = req.body;

        const subscription = await subscriptionUtils.cancelSubscriptionToFree(
            subscriptionId,
            req.user.id,
            reason
        );

        return sendSuccess(res, {
            message: 'Subscription downgraded to Free successfully',
            subscription
        });
    } catch (error: any) {
        console.error('Cancel subscription error:', error);
        return sendError(res, error.message);
    }
};

export const createTrialSubscription = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const { plan, trial_days } = req.body;

        if (!plan || !trial_days) {
            return sendError(res, 'Plan and trial_days are required', null, 400);
        }

        if (plan !== 'premium') {
            return sendError(res, 'Trial only available for premium plan', null, 400);
        }

        const subscription = await subscriptionUtils.createTrialSubscription(
            outletId,
            plan,
            trial_days,
            req.user.id
        );

        return sendSuccess(res, {
            message: `${trial_days}-day trial subscription created successfully`,
            subscription
        });
    } catch (error: any) {
        console.error('Create trial subscription error:', error);
        return sendError(res, error.message);
    }
};

export const getAllSubscriptions = async (req: AuthRequest, res: Response) => {
    try {
        const { status, plan, page = 1, limit = 20 } = req.query;

        const filter: any = {};
        if (status) filter.status = status;
        if (plan) {
            const p = String(plan);
            const planKey = normalizePlanKey(p);
            filter.plan =
                planKey === 'premium'
                    ? { $in: ['premium', 'basic', 'enterprise'] }
                    : 'free';
        }

        const skip = (Number(page) - 1) * Number(limit);

        const subscriptions = await Subscription.find(filter)
            .populate('outlet_id', 'name slug status')
            .populate('brand_id', 'name')
            .populate('assigned_by', 'username phone')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(Number(limit));

        const subscriptionsPayload = subscriptions.map((s: any) => ({
            ...(s.toObject() as any),
            plan: normalizePlanKey(s.plan),
        }));

        const total = await Subscription.countDocuments(filter);

        return sendSuccess(res, {
            subscriptions: subscriptionsPayload,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error: any) {
        console.error('Get all subscriptions error:', error);
        return sendError(res, error.message);
    }
};

export const getSubscriptionById = async (req: AuthRequest, res: Response) => {
    try {
        const { subscriptionId } = req.params;

        const subscription = await Subscription.findById(subscriptionId)
            .populate('outlet_id', 'name slug status address contact')
            .populate('brand_id', 'name logo_url')
            .populate('assigned_by', 'username phone email')
            .populate('cancelled_by', 'username phone');

        if (!subscription) {
            return sendError(res, 'Subscription not found', null, 404);
        }

        const info = subscriptionUtils.getSubscriptionInfo(subscription);

        const subscriptionPayload = {
            ...(subscription.toObject() as any),
            plan: normalizePlanKey((subscription as any).plan),
        };

        return sendSuccess(res, {
            subscription: subscriptionPayload,
            info
        });
    } catch (error: any) {
        console.error('Get subscription error:', error);
        return sendError(res, error.message);
    }
};

export const getOutletSubscription = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;

        const subscription = await subscriptionUtils.getSubscriptionByOutletId(outletId);

        if (!subscription) {
            return sendError(res, 'No subscription found for this outlet', null, 404);
        }

        const info = subscriptionUtils.getSubscriptionInfo(subscription);

        const subscriptionPayload = {
            ...(subscription.toObject() as any),
            plan: normalizePlanKey((subscription as any).plan),
        };

        return sendSuccess(res, {
            subscription: subscriptionPayload,
            info
        });
    } catch (error: any) {
        console.error('Get outlet subscription error:', error);
        return sendError(res, error.message);
    }
};

export const getSubscriptionHistory = async (req: AuthRequest, res: Response) => {
    try {
        const { subscriptionId } = req.params;

        const history = await subscriptionUtils.getSubscriptionHistory(subscriptionId);

        return sendSuccess(res, {
            history
        });
    } catch (error: any) {
        console.error('Get subscription history error:', error);
        return sendError(res, error.message);
    }
};

export const getOutletSubscriptionHistory = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;

        const history = await subscriptionUtils.getOutletSubscriptionHistory(outletId);

        return sendSuccess(res, {
            history
        });
    } catch (error: any) {
        console.error('Get outlet subscription history error:', error);
        return sendError(res, error.message);
    }
};

export const getSubscriptionStats = async (req: AuthRequest, res: Response) => {
    try {
        const stats = await subscriptionUtils.getSubscriptionStats();

        return sendSuccess(res, {
            stats
        });
    } catch (error: any) {
        console.error('Get subscription stats error:', error);
        return sendError(res, error.message);
    }
};

export const bulkUpdateSubscriptions = async (req: AuthRequest, res: Response) => {
    try {
        const { subscription_ids, action, data } = req.body;

        if (!subscription_ids || !Array.isArray(subscription_ids) || subscription_ids.length === 0) {
            return sendError(res, 'subscription_ids array is required', null, 400);
        }

        if (!action) {
            return sendError(res, 'action is required', null, 400);
        }

        const results = {
            success: 0,
            failed: 0,
            errors: [] as any[]
        };

        for (const subscriptionId of subscription_ids) {
            try {
                switch (action) {
                    case 'extend':
                        if (!data?.additional_months && !data?.additional_days) {
                            throw new Error('additional_months (preferred) or additional_days is required for extend action');
                        }
                        await subscriptionUtils.extendSubscription(subscriptionId, {
                            additional_months: data?.additional_months ? Math.floor(Number(data.additional_months)) : undefined,
                            additional_days: !data?.additional_months && data?.additional_days ? Math.floor(Number(data.additional_days)) : undefined,
                        }, req.user.id);
                        break;

                    case 'change_status':
                        if (!data?.status) {
                            throw new Error('status is required for change_status action');
                        }

                        if (data.status === 'cancelled') {
                            throw new Error("Status 'cancelled' is deprecated. Use the cancel action to downgrade to Free.");
                        }

                        await subscriptionUtils.updateSubscriptionStatus(
                            subscriptionId,
                            data.status,
                            req.user.id,
                            data.reason
                        );
                        break;

                    case 'upgrade':
                        if (!data?.plan) {
                            throw new Error('plan is required for upgrade action');
                        }
                        await subscriptionUtils.upgradeSubscriptionPlan(
                            subscriptionId,
                            normalizePlanKey(String(data.plan)) as any,
                            req.user.id
                        );
                        break;

                    default:
                        throw new Error(`Unknown action: ${action}`);
                }

                results.success++;
            } catch (error: any) {
                results.failed++;
                results.errors.push({
                    subscriptionId,
                    error: error.message
                });
            }
        }

        return sendSuccess(res, {
            message: `Bulk update completed: ${results.success} succeeded, ${results.failed} failed`,
            results
        });
    } catch (error: any) {
        console.error('Bulk update subscriptions error:', error);
        return sendError(res, error.message);
    }
};

export const getExpiringSubscriptions = async (req: AuthRequest, res: Response) => {
    try {
        const { days = 7 } = req.query;

        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + Number(days));

        const expiringSubscriptions = await Subscription.find({
            status: { $in: ['active', 'trial'] },
            $or: [
                { end_date: { $lte: futureDate, $gte: new Date() } },
                { trial_ends_at: { $lte: futureDate, $gte: new Date() } }
            ]
        })
            .populate('outlet_id', 'name slug contact')
            .populate('brand_id', 'name')
            .sort({ end_date: 1, trial_ends_at: 1 });

        const expiringPayload = expiringSubscriptions.map((s: any) => ({
            ...(s.toObject() as any),
            plan: normalizePlanKey(s.plan),
        }));

        return sendSuccess(res, {
            expiring_subscriptions: expiringPayload,
            count: expiringSubscriptions.length,
            days: Number(days)
        });
    } catch (error: any) {
        console.error('Get expiring subscriptions error:', error);
        return sendError(res, error.message);
    }
};

export const getPendingSubscriptions = async (req: AuthRequest, res: Response) => {
    try {
        const days = Number(req.query.days ?? 7);
        const lookaheadDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 7;

        const now = new Date();
        const futureDate = new Date(now);
        futureDate.setDate(futureDate.getDate() + lookaheadDays);

        const baseFilter: any = {
            $or: [
                { payment_status: 'pending' },
                { status: { $in: ['inactive', 'expired', 'trial'] } },
                { status: 'active', end_date: { $lte: futureDate, $gte: now } },
                { status: 'trial', trial_ends_at: { $lte: futureDate, $gte: now } },
            ]
        };

        const subscriptions = await Subscription.find(baseFilter)
            .populate('outlet_id', 'name slug status subscription_id')
            .populate('brand_id', 'name')
            .populate('assigned_by', 'username phone')
            .sort({ updated_at: -1 })
            .limit(500);

        const items = subscriptions
            .map((s: any) => {
                const reasons: string[] = [];

                const planKey = normalizePlanKey(s.plan);

                const endDate = s.end_date ? new Date(s.end_date) : null;
                const trialEndsAt = s.trial_ends_at ? new Date(s.trial_ends_at) : null;

                if (s.payment_status === 'pending') reasons.push('payment_pending');
                if (s.status === 'expired') reasons.push('expired');
                if (s.status === 'inactive' && planKey !== 'free') reasons.push('inactive_paid_plan');

                if (s.status === 'trial' && trialEndsAt) {
                    if (trialEndsAt <= now) reasons.push('trial_ended');
                    else if (trialEndsAt <= futureDate) reasons.push('trial_ending_soon');
                }

                if (endDate) {
                    if (endDate <= now && (s.status === 'active' || s.status === 'trial')) reasons.push('end_date_passed');
                    else if (endDate <= futureDate && endDate >= now) reasons.push('expiring_soon');
                }

                const uniqueReasons = Array.from(new Set(reasons));
                return {
                    subscription: {
                        ...(s.toObject() as any),
                        plan: planKey,
                    },
                    pending_reasons: uniqueReasons,
                    pending_score: uniqueReasons.length,
                };
            })
            .filter((x) => x.pending_score > 0)
            .sort((a, b) => b.pending_score - a.pending_score);

        const counts = items.reduce(
            (acc: Record<string, number>, item: any) => {
                for (const r of item.pending_reasons) acc[r] = (acc[r] ?? 0) + 1;
                return acc;
            },
            {}
        );

        // Outlets missing subscription linkage (helps admin resolve missing/incorrect subscription_id)
        const outletsMissingSubscription = await Outlet.find({
            $or: [
                { subscription_id: { $exists: false } },
                { subscription_id: null },
            ]
        })
            .select('name slug status brand_id created_by_user_id subscription_id')
            .sort({ updated_at: -1 })
            .limit(200);

        return sendSuccess(res, {
            lookahead_days: lookaheadDays,
            count: items.length,
            counts,
            items,
            outlets_missing_subscription: outletsMissingSubscription,
        });
    } catch (error: any) {
        console.error('Get pending subscriptions error:', error);
        return sendError(res, error.message);
    }
};

export const getMySubscription = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;

        const outlet = await Outlet.findById(outletId);
        
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, 404);
        }

        const subscription = await subscriptionUtils.getSubscriptionByOutletId(outletId);

        if (!subscription) {
            return sendSuccess(res, {
                hasSubscription: false,
                message: 'No active subscription. Contact admin to activate premium features.'
            });
        }

        const info = subscriptionUtils.getSubscriptionInfo(subscription);

        return sendSuccess(res, {
            subscription: {
                plan: subscription.plan,
                status: subscription.status,
                features: subscription.features,
                start_date: subscription.start_date,
                end_date: subscription.end_date,
                trial_ends_at: subscription.trial_ends_at
            },
            info
        });
    } catch (error: any) {
        console.error('Get my subscription error:', error);
        return sendError(res, error.message);
    }
};
