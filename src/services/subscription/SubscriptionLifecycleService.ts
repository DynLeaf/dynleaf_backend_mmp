import mongoose from 'mongoose';
import { AppError } from '../../errors/AppError.js';
import * as subRepo from '../../repositories/subscriptionRepository.js';
import { getSubscriptionPlan } from '../../config/subscriptionPlans.js';
import { normalizePlanKey, toObjectId } from './SubscriptionHelper.js';
import { SubscriptionCoreService } from './SubscriptionCoreService.js';

export class SubscriptionLifecycleService {
    static async upgradeSubscriptionPlan(
        subscriptionId: string,
        newPlan: 'free' | 'basic' | 'premium' | 'enterprise',
        changedBy?: mongoose.Types.ObjectId | string
    ) {
        const changedById = toObjectId(changedBy);
        const normalizedNewPlan = normalizePlanKey(newPlan);
        const plan = getSubscriptionPlan(normalizedNewPlan);
        if (!plan) throw new AppError(`Invalid subscription plan: ${normalizedNewPlan}`, 400);

        const subscription = await subRepo.findSubscriptionById(subscriptionId);
        if (!subscription) throw new AppError('Subscription not found', 404);

        const previousPlan = normalizePlanKey(subscription.plan);
        const previousStatus = subscription.status;
        subscription.plan = normalizedNewPlan as any;
        subscription.features = plan.features;

        if (previousPlan === 'free' && normalizedNewPlan !== 'free') {
            const now = new Date();
            subscription.start_date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
        }

        if (normalizedNewPlan === 'free') {
            subscription.end_date = undefined;
            subscription.trial_ends_at = undefined;
            subscription.auto_renew = false;
            if (subscription.status === 'trial') subscription.status = 'active';
        } else {
            if (!subscription.end_date) {
                const now = new Date();
                const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
                start.setUTCDate(start.getUTCDate() + 30);
                subscription.end_date = start;
            }
        }

        const isPaidPlan = normalizedNewPlan !== 'free';
        const shouldAutoActivate = isPaidPlan && subscription.status === 'inactive';
        if (shouldAutoActivate) subscription.status = 'active';

        await subscription.save();

        await subRepo.createSubscriptionHistory({
            subscription_id: subscription._id,
            outlet_id: subscription.outlet_id,
            action: previousPlan === 'free' && normalizedNewPlan === 'premium' ? 'upgraded' : 'downgraded',
            previous_plan: previousPlan,
            new_plan: normalizedNewPlan,
            changed_by: changedById,
            changed_at: new Date()
        });

        if (shouldAutoActivate) {
            await subRepo.createSubscriptionHistory({
                subscription_id: subscription._id,
                outlet_id: subscription.outlet_id,
                action: 'status_changed',
                previous_status: previousStatus,
                new_status: 'active',
                changed_by: changedById,
                changed_at: new Date(),
                reason: 'Auto-activated on plan upgrade'
            });
        }

        return subscription;
    }

    static async extendSubscription(
        subscriptionId: string,
        extension: { additional_months?: number; additional_days?: number },
        changedBy?: mongoose.Types.ObjectId | string
    ) {
        const changedById = toObjectId(changedBy);
        const subscription = await subRepo.findSubscriptionById(subscriptionId);
        if (!subscription) throw new AppError('Subscription not found', 404);

        const DAYS_PER_MONTH = 30;
        const toUTCMidnight = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
        const addDaysAtUTCMidnight = (date: Date, daysToAdd: number) => {
            const d = toUTCMidnight(date);
            d.setUTCDate(d.getUTCDate() + daysToAdd);
            return d;
        };

        const hasMonths = typeof extension.additional_months === 'number' && extension.additional_months > 0;
        const hasDays = typeof extension.additional_days === 'number' && extension.additional_days > 0;
        if (!hasMonths && !hasDays) throw new AppError('Valid additional_months or additional_days is required', 400);

        const now = new Date();
        const baseDate = subscription.end_date && subscription.end_date > now ? subscription.end_date : toUTCMidnight(now);

        const newEndDate = hasMonths
            ? addDaysAtUTCMidnight(baseDate, Math.floor(extension.additional_months!) * DAYS_PER_MONTH)
            : addDaysAtUTCMidnight(baseDate, Math.floor(extension.additional_days!));
            
        subscription.end_date = newEndDate;
        if (subscription.status === 'expired') subscription.status = 'active';

        await subscription.save();

        await subRepo.createSubscriptionHistory({
            subscription_id: subscription._id,
            outlet_id: subscription.outlet_id,
            action: 'extended',
            changed_by: changedById,
            changed_at: new Date(),
            reason: hasMonths ? `Extended by ${Math.floor(extension.additional_months!)} month(s)` : `Extended by ${Math.floor(extension.additional_days!)} day(s)`,
            metadata: hasMonths
                ? { additional_months: Math.floor(extension.additional_months!), new_end_date: newEndDate }
                : { additional_days: Math.floor(extension.additional_days!), new_end_date: newEndDate }
        });

        return subscription;
    }

    static async cancelSubscriptionToFree(
        subscriptionId: string,
        changedBy?: mongoose.Types.ObjectId | string,
        reason?: string
    ) {
        const changedById = toObjectId(changedBy);
        const subscription = await subRepo.findSubscriptionById(subscriptionId);
        if (!subscription) throw new AppError('Subscription not found', 404);

        const previousPlan = normalizePlanKey(subscription.plan);
        const previousStatus = subscription.status === 'cancelled' ? 'inactive' : subscription.status;

        const freePlan = getSubscriptionPlan('free');
        subscription.plan = 'free' as any;
        subscription.features = freePlan?.features ?? [];
        subscription.status = 'active';
        subscription.auto_renew = false;
        subscription.end_date = undefined;
        subscription.trial_ends_at = undefined;
        subscription.cancelled_at = new Date();
        
        if (changedById) subscription.cancelled_by = changedById as any;
        if (reason !== undefined) subscription.cancellation_reason = reason;

        await subscription.save();

        await subRepo.createSubscriptionHistory({
            subscription_id: subscription._id,
            outlet_id: subscription.outlet_id,
            action: 'downgraded',
            previous_plan: previousPlan,
            new_plan: 'free',
            previous_status: previousStatus,
            new_status: 'active',
            changed_by: changedById,
            changed_at: new Date(),
            reason
        });

        return subscription;
    }

    static async createTrialSubscription(
        outletId: string, plan: 'premium', trialDays: number, assignedBy: mongoose.Types.ObjectId
    ) {
        const planDetails = getSubscriptionPlan('premium');
        if (!planDetails) throw new AppError(`Invalid subscription plan: premium`, 400);

        const outlet = await subRepo.findOutletById(outletId);
        if (!outlet) throw new AppError('Outlet not found', 404);

        const now = new Date();
        const trialEndsAt = new Date(now);
        trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

        const existing = await subRepo.findSubscriptionByOutletId(outletId);
        if (!existing) {
            const created = await SubscriptionCoreService.ensureSubscriptionForOutlet(outletId, {
                plan: 'premium', status: 'trial', start_date: now, trial_ends_at: trialEndsAt, assigned_by: assignedBy, notes: `${trialDays}-day trial period`
            });
            await subRepo.updateSubscriptionHistoryMetadata(created._id, 'created', { trial_days: trialDays, trial_ends_at: trialEndsAt });
            return created;
        }

        if (!outlet.subscription_id || outlet.subscription_id.toString() !== existing._id.toString()) {
            await subRepo.updateOutletSubscriptionId(outletId, existing._id);
        }

        if (normalizePlanKey(existing.plan) !== 'premium') {
            await this.upgradeSubscriptionPlan(existing._id.toString(), 'premium', assignedBy);
        }

        const sub = (await subRepo.findSubscriptionById(existing._id.toString())) as any;
        if (!sub) throw new AppError('Subscription not found', 404);

        sub.status = 'trial';
        sub.start_date = now;
        sub.trial_ends_at = trialEndsAt;
        sub.assigned_by = assignedBy as any;
        sub.assigned_at = now;
        sub.notes = `${trialDays}-day trial period`;
        sub.payment_status = 'pending';
        sub.auto_renew = false;
        sub.plan = 'premium' as any;
        sub.features = planDetails.features;

        await sub.save();

        await subRepo.createSubscriptionHistory({
            subscription_id: sub._id, outlet_id: outlet._id, action: 'status_changed',
            previous_plan: normalizePlanKey(existing.plan), new_plan: sub.plan,
            previous_status: existing.status, new_status: 'trial',
            changed_by: assignedBy, changed_at: now, reason: `${trialDays}-day trial period`,
            metadata: { trial_days: trialDays, trial_ends_at: trialEndsAt }
        });

        return sub;
    }

    static async assignSubscriptionToOutlet(outletId: string, assignment: any) {
        const normalizedPlan = normalizePlanKey(assignment.plan);
        const plan = getSubscriptionPlan(normalizedPlan);
        if (!plan) throw new AppError(`Invalid subscription plan: ${normalizedPlan}`, 400);

        const outlet = await subRepo.findOutletById(outletId);
        if (!outlet) throw new AppError('Outlet not found', 404);

        const existing = await subRepo.findSubscriptionByOutletId(outletId);
        if (!existing) {
            return await SubscriptionCoreService.ensureSubscriptionForOutlet(outletId, {
                ...assignment, plan: normalizedPlan
            });
        }

        if (!outlet.subscription_id || outlet.subscription_id.toString() !== existing._id.toString()) {
            await subRepo.updateOutletSubscriptionId(outletId, existing._id);
        }

        if (assignment.plan && normalizePlanKey(existing.plan) !== normalizedPlan) {
            await this.upgradeSubscriptionPlan(existing._id.toString(), normalizedPlan as any, assignment.assigned_by);
        }

        if (assignment.status && assignment.status !== existing.status) {
            await SubscriptionCoreService.updateSubscriptionStatus(existing._id.toString(), assignment.status, assignment.assigned_by, assignment.notes);
        }

        const updated = await subRepo.findSubscriptionById(existing._id.toString());
        if (!updated) throw new AppError('Subscription not found', 404);

        if (assignment.start_date !== undefined) updated.start_date = assignment.start_date;
        if (assignment.end_date !== undefined) updated.end_date = assignment.end_date;
        if (assignment.trial_ends_at !== undefined) updated.trial_ends_at = assignment.trial_ends_at;
        if (assignment.assigned_by !== undefined) updated.assigned_by = toObjectId(assignment.assigned_by) as any;
        updated.assigned_at = new Date();
        if (assignment.notes !== undefined) updated.notes = assignment.notes;

        await updated.save();
        return updated;
    }
}
