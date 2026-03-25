import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware.js';
import * as subService from '../services/subscriptionService.js';
import { sendSuccess, sendError } from '../utils/response.js';

export const assignSubscription = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const { plan, status, start_date, end_date, trial_ends_at, notes } = req.body;

        if (!plan || !status) return sendError(res, 'Plan and status are required', null, 400);

        const assignmentData = {
            plan, status,
            start_date: start_date ? new Date(start_date) : undefined,
            end_date: end_date ? new Date(end_date) : undefined,
            trial_ends_at: trial_ends_at ? new Date(trial_ends_at) : undefined,
            notes,
            assigned_by: req.user.id !== 'admin' ? req.user.id : undefined
        };

        const subscription = await subService.assignSubscriptionToOutlet(outletId, assignmentData);
        return sendSuccess(res, { message: 'Subscription assigned successfully', subscription });
    } catch (error: any) { return sendError(res, error.message); }
};

export const updateSubscription = async (req: AuthRequest, res: Response) => {
    try {
        const updatedSub = await subService.updateSubscriptionDirect(req.params.subscriptionId, req.body, req.user.id);
        return sendSuccess(res, { message: 'Subscription updated successfully', subscription: updatedSub });
    } catch (error: any) { return sendError(res, error.message); }
};

export const extendSubscription = async (req: AuthRequest, res: Response) => {
    try {
        const subscription = await subService.extendSubscription(req.params.subscriptionId, req.body, req.user.id);
        return sendSuccess(res, { message: 'Subscription extended', subscription });
    } catch (error: any) { return sendError(res, error.message); }
};

export const cancelSubscription = async (req: AuthRequest, res: Response) => {
    try {
        const subscription = await subService.cancelSubscriptionToFree(req.params.subscriptionId, req.user.id, req.body.reason);
        return sendSuccess(res, { message: 'Subscription downgraded to Free successfully', subscription });
    } catch (error: any) { return sendError(res, error.message); }
};

export const createTrialSubscription = async (req: AuthRequest, res: Response) => {
    try {
        const { plan, trial_days } = req.body;
        if (!plan || !trial_days) return sendError(res, 'Plan and trial_days are required', null, 400);
        if (plan !== 'premium') return sendError(res, 'Trial only available for premium plan', null, 400);

        const subscription = await subService.createTrialSubscription(req.params.outletId, plan, trial_days, req.user.id as any);
        return sendSuccess(res, { message: `${trial_days}-day trial subscription created successfully`, subscription });
    } catch (error: any) { return sendError(res, error.message); }
};

export const getAllSubscriptions = async (req: AuthRequest, res: Response) => {
    try {
        const result = await subService.listSubscriptions(req.query.status as string, req.query.plan as string, req.query.page as any, req.query.limit as any);
        return sendSuccess(res, result);
    } catch (error: any) { return sendError(res, error.message); }
};

export const getSubscriptionById = async (req: AuthRequest, res: Response) => {
    try {
        const subRepo = await import('../repositories/subscriptionRepository.js');
        const subscription = await subRepo.findSubscriptionById(req.params.subscriptionId, [
            { path: 'outlet_id', select: 'name slug status address contact' },
            { path: 'brand_id', select: 'name logo_url' },
            { path: 'assigned_by', select: 'username phone email' },
            { path: 'cancelled_by', select: 'username phone' }
        ]);

        if (!subscription) return sendError(res, 'Subscription not found', null, 404);
        const info = subService.getSubscriptionInfo(subscription);
        const payload = { ...(subscription.toObject() as any), plan: info.plan };

        return sendSuccess(res, { subscription: payload, info });
    } catch (error: any) { return sendError(res, error.message); }
};

export const getOutletSubscription = async (req: AuthRequest, res: Response) => {
    try {
        const subRepo = await import('../repositories/subscriptionRepository.js');
        const subscription = await subRepo.findSubscriptionByOutletId(req.params.outletId);
        if (!subscription) return sendError(res, 'No subscription found for this outlet', null, 404);

        const info = subService.getSubscriptionInfo(subscription);
        const payload = { ...(subscription.toObject() as any), plan: info.plan };
        return sendSuccess(res, { subscription: payload, info });
    } catch (error: any) { return sendError(res, error.message); }
};

export const getSubscriptionHistory = async (req: AuthRequest, res: Response) => {
    try {
        const history = await subService.getSubscriptionHistory(req.params.subscriptionId);
        return sendSuccess(res, { history });
    } catch (error: any) { return sendError(res, error.message); }
};

export const getOutletSubscriptionHistory = async (req: AuthRequest, res: Response) => {
    try {
        const history = await subService.getOutletSubscriptionHistory(req.params.outletId);
        return sendSuccess(res, { history });
    } catch (error: any) { return sendError(res, error.message); }
};

export const getSubscriptionStats = async (req: AuthRequest, res: Response) => {
    try {
        const stats = await subService.getSubscriptionStats();
        return sendSuccess(res, { stats });
    } catch (error: any) { return sendError(res, error.message); }
};

export const bulkUpdateSubscriptions = async (req: AuthRequest, res: Response) => {
    try {
        const { subscription_ids, action, data } = req.body;
        if (!subscription_ids || !Array.isArray(subscription_ids)) return sendError(res, 'subscription_ids array is required', null, 400);
        if (!action) return sendError(res, 'action is required', null, 400);

        const results = await subService.bulkUpdateSubscriptions(subscription_ids, action, data, req.user.id);
        return sendSuccess(res, { message: `Bulk update completed: ${results.success} succeeded, ${results.failed} failed`, results });
    } catch (error: any) { return sendError(res, error.message); }
};

export const getExpiringSubscriptions = async (req: AuthRequest, res: Response) => {
    try {
        const result = await subService.getExpiringSubscriptions(req.query.days as any || 7);
        return sendSuccess(res, result);
    } catch (error: any) { return sendError(res, error.message); }
};

export const getPendingSubscriptions = async (req: AuthRequest, res: Response) => {
    try {
        const result = await subService.getPendingSubscriptions(req.query.days as any || 7);
        return sendSuccess(res, result);
    } catch (error: any) { return sendError(res, error.message); }
};

export const getMySubscription = async (req: AuthRequest, res: Response) => {
    try {
        const subRepo = await import('../repositories/subscriptionRepository.js');
        const outlet = await subRepo.findOutletById(req.params.outletId);
        if (!outlet) return sendError(res, 'Outlet not found', null, 404);

        const subscription = await subRepo.findSubscriptionByOutletId(req.params.outletId);
        if (!subscription) return sendSuccess(res, { hasSubscription: false, message: 'No active subscription.' });

        const info = subService.getSubscriptionInfo(subscription);
        return sendSuccess(res, {
            subscription: {
                plan: subscription.plan, status: subscription.status, features: subscription.features,
                start_date: subscription.start_date, end_date: subscription.end_date, trial_ends_at: subscription.trial_ends_at
            },
            info
        });
    } catch (error: any) { return sendError(res, error.message); }
};
