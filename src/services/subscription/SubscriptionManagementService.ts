import * as subRepo from '../../repositories/subscriptionRepository.js';
import { AppError } from '../../errors/AppError.js';
import { normalizePlanKey } from './SubscriptionHelper.js';
import { SubscriptionCoreService } from './SubscriptionCoreService.js';
import { SubscriptionLifecycleService } from './SubscriptionLifecycleService.js';

export class SubscriptionManagementService {
    static async listSubscriptions(status?: string, plan?: string, page = 1, limit = 20) {
        const filter: any = {};
        if (status) filter.status = status;
        if (plan) {
            const planKey = normalizePlanKey(String(plan));
            filter.plan = planKey === 'premium' ? { $in: ['premium', 'basic', 'enterprise'] } : 'free';
        }
        const skip = (Number(page) - 1) * Number(limit);
        
        const subscriptions = await subRepo.findSubscriptionsList(filter, skip, Number(limit));
        const total = await subRepo.countSubscriptions(filter);

        return {
            subscriptions: subscriptions.map(s => ({ ...(s.toObject() as any), plan: normalizePlanKey(s.plan) })),
            pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) }
        };
    }

    static async updateSubscriptionDirect(subscriptionId: string, updates: any, userId: string) {
        let subscription = await subRepo.findSubscriptionById(subscriptionId, ['outlet_id']);
        if (!subscription) throw new AppError('Subscription not found', 404);

        if (updates.plan) {
            const outlet = subscription.outlet_id as any;
            if (outlet && outlet.approval_status !== 'APPROVED') {
                throw new AppError('Cannot change subscription plan for non-approved outlets.', 403);
            }
        }

        let didExternalUpdate = false;
        if (updates.plan) {
            const nextPlan = normalizePlanKey(updates.plan);
            if (nextPlan !== normalizePlanKey(subscription.plan)) {
                await SubscriptionLifecycleService.upgradeSubscriptionPlan(subscriptionId, nextPlan as any, userId);
                didExternalUpdate = true;
            }
        }

        if (updates.status === 'cancelled') throw new AppError("Status 'cancelled' is deprecated. Use cancel action.", 400);

        if (updates.status && updates.status !== subscription.status) {
            await SubscriptionCoreService.updateSubscriptionStatus(subscriptionId, updates.status, userId, updates.notes);
            didExternalUpdate = true;
        }

        if (didExternalUpdate) {
            subscription = await subRepo.findSubscriptionById(subscriptionId);
            if (!subscription) throw new AppError('Subscription not found', 404);
        }

        if (updates.end_date !== undefined) subscription.end_date = updates.end_date ? new Date(updates.end_date) : undefined;
        if (updates.notes !== undefined) subscription.notes = updates.notes;
        if (updates.auto_renew !== undefined) subscription.auto_renew = updates.auto_renew;
        if (updates.payment_status !== undefined) subscription.payment_status = updates.payment_status;

        await subscription.save();
        
        const updatedSub = await subRepo.findSubscriptionById(subscriptionId, [
            { path: 'outlet_id', select: 'name slug' },
            { path: 'brand_id', select: 'name' },
            { path: 'assigned_by', select: 'username phone' }
        ]);
        
        return updatedSub ? { ...(updatedSub.toObject() as any), plan: normalizePlanKey((updatedSub as any).plan) } : null;
    }

    static async bulkUpdateSubscriptions(subscriptionIds: string[], action: string, data: any, adminId: string) {
        const results = { success: 0, failed: 0, errors: [] as any[] };
        for (const subscriptionId of subscriptionIds) {
            try {
                switch (action) {
                    case 'extend':
                        await SubscriptionLifecycleService.extendSubscription(subscriptionId, data, adminId);
                        break;
                    case 'change_status':
                        await SubscriptionCoreService.updateSubscriptionStatus(subscriptionId, data.status, adminId, data.reason);
                        break;
                    case 'upgrade':
                        await SubscriptionLifecycleService.upgradeSubscriptionPlan(subscriptionId, data.plan, adminId);
                        break;
                    default:
                        throw new Error(`Unknown action: ${action}`);
                }
                results.success++;
            } catch (error: any) {
                results.failed++;
                results.errors.push({ subscriptionId, error: error.message });
            }
        }
        return results;
    }
}
