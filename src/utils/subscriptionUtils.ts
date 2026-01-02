import { Outlet, IOutlet } from '../models/Outlet.js';
import { Subscription, SubscriptionHistory, ISubscription } from '../models/Subscription.js';
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_FEATURES, getSubscriptionPlan } from '../config/subscriptionPlans.js';
import mongoose from 'mongoose';

const toObjectId = (id?: mongoose.Types.ObjectId | string) => {
    if (!id) return undefined;
    return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
};

export interface SubscriptionAssignment {
    plan: 'free' | 'basic' | 'premium' | 'enterprise';
    status: 'active' | 'inactive' | 'expired' | 'trial';
    start_date?: Date;
    end_date?: Date;
    trial_ends_at?: Date;
    assigned_by?: mongoose.Types.ObjectId | string;
    notes?: string;
}

export interface EnsureSubscriptionOptions {
    plan?: 'free' | 'basic' | 'premium' | 'enterprise';
    status?: 'active' | 'inactive' | 'expired' | 'trial' | 'cancelled';
    start_date?: Date;
    end_date?: Date;
    trial_ends_at?: Date;
    assigned_by?: mongoose.Types.ObjectId | string;
    notes?: string;
}

/**
 * Ensure an outlet has exactly one Subscription.
 * - If missing, creates a new subscription (and history) and links it on Outlet.
 * - If present, ensures Outlet.subscription_id points to it.
 */
export const ensureSubscriptionForOutlet = async (
    outletId: string,
    options: EnsureSubscriptionOptions = {}
): Promise<ISubscription> => {
    const outlet = await Outlet.findById(outletId);
    if (!outlet) {
        throw new Error('Outlet not found');
    }

    const existing = await Subscription.findOne({ outlet_id: outlet._id });
    if (existing) {
        if (!outlet.subscription_id || outlet.subscription_id.toString() !== existing._id.toString()) {
            outlet.subscription_id = existing._id;
            await outlet.save();
        }
        return existing;
    }

    const planKey = options.plan ?? 'free';
    const planDetails = getSubscriptionPlan(planKey);
    if (!planDetails) {
        throw new Error(`Invalid subscription plan: ${planKey}`);
    }

    const now = new Date();

    const subscription = new Subscription({
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

    await subscription.save();

    outlet.subscription_id = subscription._id;
    await outlet.save();

    await SubscriptionHistory.create({
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
};

export const assignSubscriptionToOutlet = async (
    outletId: string,
    assignment: SubscriptionAssignment
): Promise<ISubscription> => {
    const plan = getSubscriptionPlan(assignment.plan);
    
    if (!plan) {
        throw new Error(`Invalid subscription plan: ${assignment.plan}`);
    }

    const outlet = await Outlet.findById(outletId);
    if (!outlet) {
        throw new Error('Outlet not found');
    }

    const existing = await Subscription.findOne({ outlet_id: outlet._id });

    if (!existing) {
        return await ensureSubscriptionForOutlet(outletId, {
            plan: assignment.plan,
            status: assignment.status,
            start_date: assignment.start_date,
            end_date: assignment.end_date,
            trial_ends_at: assignment.trial_ends_at,
            assigned_by: assignment.assigned_by,
            notes: assignment.notes
        });
    }

    if (!outlet.subscription_id || outlet.subscription_id.toString() !== existing._id.toString()) {
        outlet.subscription_id = existing._id;
        await outlet.save();
    }

    if (assignment.plan && assignment.plan !== existing.plan) {
        await upgradeSubscriptionPlan(existing._id.toString(), assignment.plan, assignment.assigned_by);
    }

    if (assignment.status && assignment.status !== existing.status) {
        await updateSubscriptionStatus(existing._id.toString(), assignment.status as any, assignment.assigned_by, assignment.notes);
    }

    const updated = await Subscription.findById(existing._id);
    if (!updated) {
        throw new Error('Subscription not found');
    }

    if (assignment.start_date !== undefined) updated.start_date = assignment.start_date;
    if (assignment.end_date !== undefined) updated.end_date = assignment.end_date;
    if (assignment.trial_ends_at !== undefined) updated.trial_ends_at = assignment.trial_ends_at;
    if (assignment.assigned_by !== undefined) updated.assigned_by = toObjectId(assignment.assigned_by);
    updated.assigned_at = new Date();
    if (assignment.notes !== undefined) updated.notes = assignment.notes;

    await updated.save();
    return updated;
};

export const updateSubscriptionStatus = async (
    subscriptionId: string,
    status: 'active' | 'inactive' | 'expired' | 'trial' | 'cancelled',
    changedBy?: mongoose.Types.ObjectId | string,
    reason?: string
): Promise<ISubscription | null> => {
    const subscription = await Subscription.findById(subscriptionId);
    
    if (!subscription) {
        throw new Error('Subscription not found');
    }

    const previousStatus = subscription.status;
    subscription.status = status;
    const changedById = toObjectId(changedBy);
    
    if (status === 'cancelled') {
        subscription.cancelled_at = new Date();
        if (changedById) subscription.cancelled_by = changedById;
        subscription.cancellation_reason = reason;
    }
    
    await subscription.save();

    await SubscriptionHistory.create({
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
};

export const extendSubscription = async (
    subscriptionId: string,
    additionalDays: number,
    changedBy?: mongoose.Types.ObjectId | string
): Promise<ISubscription | null> => {
        const changedById = toObjectId(changedBy);
    const subscription = await Subscription.findById(subscriptionId);
    
    if (!subscription) {
        throw new Error('Subscription not found');
    }

    const currentEndDate = subscription.end_date || new Date();
    const newEndDate = new Date(currentEndDate);
    newEndDate.setDate(newEndDate.getDate() + additionalDays);

    subscription.end_date = newEndDate;
    
    if (subscription.status === 'expired') {
        subscription.status = 'active';
    }

    await subscription.save();

    await SubscriptionHistory.create({
        subscription_id: subscription._id,
        outlet_id: subscription.outlet_id,
        action: 'extended',
        changed_by: changedById,
        changed_at: new Date(),
        reason: `Extended by ${additionalDays} days`,
        metadata: { additional_days: additionalDays, new_end_date: newEndDate }
    });

    return subscription;
};

export const upgradeSubscriptionPlan = async (
    subscriptionId: string,
    newPlan: 'free' | 'basic' | 'premium' | 'enterprise',
    changedBy?: mongoose.Types.ObjectId | string
): Promise<ISubscription | null> => {
        const changedById = toObjectId(changedBy);
    const plan = getSubscriptionPlan(newPlan);
    
    if (!plan) {
        throw new Error(`Invalid subscription plan: ${newPlan}`);
    }

    const subscription = await Subscription.findById(subscriptionId);
    
    if (!subscription) {
        throw new Error('Subscription not found');
    }

    const previousPlan = subscription.plan;
    subscription.plan = newPlan;
    subscription.features = plan.features;

    await subscription.save();

    const action = previousPlan === 'free' || 
                   (previousPlan === 'basic' && (newPlan === 'premium' || newPlan === 'enterprise')) ||
                   (previousPlan === 'premium' && newPlan === 'enterprise')
                   ? 'upgraded' : 'downgraded';

    await SubscriptionHistory.create({
        subscription_id: subscription._id,
        outlet_id: subscription.outlet_id,
        action,
        previous_plan: previousPlan,
        new_plan: newPlan,
        changed_by: changedById,
        changed_at: new Date()
    });

    return subscription;
};

export const checkSubscriptionExpiry = async (): Promise<void> => {
    const now = new Date();

    const expiredByEndDate = await Subscription.updateMany(
        {
            status: { $in: ['active', 'trial'] },
            end_date: { $lte: now }
        },
        {
            $set: { status: 'expired' }
        }
    );

    const expiredByTrial = await Subscription.updateMany(
        {
            status: 'trial',
            trial_ends_at: { $lte: now }
        },
        {
            $set: { status: 'expired' }
        }
    );

    console.log(`Expired ${expiredByEndDate.modifiedCount} subscriptions by end_date`);
    console.log(`Expired ${expiredByTrial.modifiedCount} trial subscriptions`);
};

export const getSubscriptionStats = async () => {
    const stats = await Subscription.aggregate([
        {
            $group: {
                _id: {
                    plan: '$plan',
                    status: '$status'
                },
                count: { $sum: 1 }
            }
        },
        {
            $sort: { '_id.plan': 1, '_id.status': 1 }
        }
    ]);

    const totalOutlets = await Outlet.countDocuments();
    const totalSubscriptions = await Subscription.countDocuments();
    const activeSubscriptions = await Subscription.countDocuments({ status: 'active' });
    const expiredSubscriptions = await Subscription.countDocuments({ status: 'expired' });
    const trialSubscriptions = await Subscription.countDocuments({ status: 'trial' });
    const cancelledSubscriptions = await Subscription.countDocuments({ status: 'cancelled' });

    return {
        totalOutlets,
        totalSubscriptions,
        outletsWithoutSubscription: totalOutlets - totalSubscriptions,
        activeSubscriptions,
        expiredSubscriptions,
        trialSubscriptions,
        cancelledSubscriptions,
        breakdown: stats
    };
};

export const hasSubscriptionFeature = (subscription: ISubscription | null, feature: string): boolean => {
    if (!subscription) {
        return false;
    }

    if (subscription.status !== 'active' && subscription.status !== 'trial') {
        return false;
    }

    return subscription.features.includes(feature);
};

export const getSubscriptionInfo = (subscription: ISubscription | null) => {
    if (!subscription) {
        return {
            hasSubscription: false,
            plan: null,
            status: null,
            features: [],
            limits: null,
            daysRemaining: null
        };
    }

    const plan = getSubscriptionPlan(subscription.plan);
    let daysRemaining = null;

    if (subscription.end_date) {
        const now = new Date();
        const endDate = new Date(subscription.end_date);
        const diffTime = endDate.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
        hasSubscription: true,
        subscriptionId: subscription._id,
        plan: subscription.plan,
        planDetails: plan,
        status: subscription.status,
        features: subscription.features,
        limits: plan?.limits,
        startDate: subscription.start_date,
        endDate: subscription.end_date,
        daysRemaining,
        isExpired: subscription.status === 'expired',
        isTrial: subscription.status === 'trial',
        isCancelled: subscription.status === 'cancelled',
        trialEndsAt: subscription.trial_ends_at,
        autoRenew: subscription.auto_renew,
        paymentStatus: subscription.payment_status,
        notes: subscription.notes
    };
};

export const createTrialSubscription = async (
    outletId: string,
    plan: 'basic' | 'premium' | 'enterprise',
    trialDays: number,
    assignedBy: mongoose.Types.ObjectId
): Promise<ISubscription> => {
    const planDetails = getSubscriptionPlan(plan);
    
    if (!planDetails) {
        throw new Error(`Invalid subscription plan: ${plan}`);
    }

    const outlet = await Outlet.findById(outletId);
    if (!outlet) {
        throw new Error('Outlet not found');
    }

    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    const existing = await Subscription.findOne({ outlet_id: outlet._id });
    if (!existing) {
        const created = await ensureSubscriptionForOutlet(outletId, {
            plan,
            status: 'trial',
            start_date: now,
            trial_ends_at: trialEndsAt,
            assigned_by: assignedBy,
            notes: `${trialDays}-day trial period`
        });

        await SubscriptionHistory.updateOne(
            { subscription_id: created._id, action: 'created' },
            { $set: { metadata: { trial_days: trialDays, trial_ends_at: trialEndsAt } } }
        );

        return created;
    }

    if (!outlet.subscription_id || outlet.subscription_id.toString() !== existing._id.toString()) {
        outlet.subscription_id = existing._id;
        await outlet.save();
    }

    const previousPlan = existing.plan;
    const previousStatus = existing.status;

    if (plan !== existing.plan) {
        await upgradeSubscriptionPlan(existing._id.toString(), plan as any, assignedBy);
    }

    const sub = await Subscription.findById(existing._id);
    if (!sub) {
        throw new Error('Subscription not found');
    }

    sub.status = 'trial';
    sub.start_date = now;
    sub.trial_ends_at = trialEndsAt;
    sub.assigned_by = assignedBy;
    sub.assigned_at = now;
    sub.notes = `${trialDays}-day trial period`;
    sub.payment_status = 'pending';
    sub.auto_renew = false;

    await sub.save();

    await SubscriptionHistory.create({
        subscription_id: sub._id,
        outlet_id: outlet._id,
        action: 'status_changed',
        previous_plan: previousPlan,
        new_plan: sub.plan,
        previous_status: previousStatus,
        new_status: 'trial',
        changed_by: assignedBy,
        changed_at: now,
        reason: `${trialDays}-day trial period`,
        metadata: { trial_days: trialDays, trial_ends_at: trialEndsAt }
    });

    return sub;
};

export const getSubscriptionByOutletId = async (outletId: string): Promise<ISubscription | null> => {
    return await Subscription.findOne({ outlet_id: outletId });
};

export const getSubscriptionHistory = async (subscriptionId: string) => {
    return await SubscriptionHistory.find({ subscription_id: subscriptionId })
        .populate('changed_by', 'username phone')
        .sort({ changed_at: -1 });
};

export const getOutletSubscriptionHistory = async (outletId: string) => {
    return await SubscriptionHistory.find({ outlet_id: outletId })
        .populate('changed_by', 'username phone')
        .sort({ changed_at: -1 });
};
