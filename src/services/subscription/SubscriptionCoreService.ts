import mongoose from 'mongoose';
import { AppError } from '../../errors/AppError.js';
import * as subRepo from '../../repositories/subscriptionRepository.js';
import { getSubscriptionPlan } from '../../config/subscriptionPlans.js';
import { normalizePlanKey, toObjectId } from './SubscriptionHelper.js';

export class SubscriptionCoreService {
    static async ensureSubscriptionForOutlet(outletId: string, options: any = {}) {
        const outlet = await subRepo.findOutletById(outletId);
        if (!outlet) throw new AppError('Outlet not found', 404);

        const existing = await subRepo.findSubscriptionByOutletId(outletId);
        if (existing) {
            if (!outlet.subscription_id || outlet.subscription_id.toString() !== existing._id.toString()) {
                await subRepo.updateOutletSubscriptionId(outletId, existing._id);
            }
            return existing;
        }

        const planKey = normalizePlanKey(options.plan ?? 'free');
        const planDetails = getSubscriptionPlan(planKey);
        if (!planDetails) throw new AppError(`Invalid subscription plan: ${planKey}`, 400);

        const now = new Date();
        const subscription = await subRepo.createSubscription({
            outlet_id: outlet._id,
            brand_id: outlet.brand_id,
            plan: planKey,
            status: options.status ?? 'active',
            features: planDetails.features,
            start_date: options.start_date ?? now,
            end_date: options.end_date,
            trial_ends_at: options.trial_ends_at,
            assigned_by: toObjectId(options.assigned_by),
            assigned_at: now,
            payment_status: 'pending',
            auto_renew: false,
            notes: options.notes
        });

        await subRepo.updateOutletSubscriptionId(outletId, subscription._id);

        await subRepo.createSubscriptionHistory({
            subscription_id: subscription._id,
            outlet_id: outlet._id,
            action: 'created',
            new_plan: subscription.plan,
            new_status: subscription.status,
            changed_by: toObjectId(options.assigned_by),
            changed_at: now,
            reason: options.notes
        });

        return subscription;
    }

    static async updateSubscriptionStatus(
        subscriptionId: string,
        status: 'active' | 'inactive' | 'expired' | 'trial' | 'cancelled',
        changedBy?: mongoose.Types.ObjectId | string,
        reason?: string
    ) {
        const subscription = await subRepo.findSubscriptionById(subscriptionId);
        if (!subscription) throw new AppError('Subscription not found', 404);

        const previousStatus = subscription.status;
        subscription.status = status;
        const changedById = toObjectId(changedBy);

        if (status === 'cancelled') {
            subscription.cancelled_at = new Date();
            if (changedById) subscription.cancelled_by = changedById as any;
            subscription.cancellation_reason = reason;
        }

        await subscription.save();

        await subRepo.createSubscriptionHistory({
            subscription_id: subscription._id,
            outlet_id: subscription.outlet_id,
            action: 'status_changed',
            previous_status: previousStatus,
            new_status: status,
            changed_by: changedById,
            changed_at: new Date(),
            reason
        });

        return subscription;
    }
}
