import mongoose from 'mongoose';
import { Subscription, SubscriptionHistory } from '../models/Subscription.js';
import { ensureSubscriptionForOutlet } from './subscriptionUtils.js';
import { normalizePlanToTier, hasFeature, SUBSCRIPTION_FEATURES } from '../config/subscriptionPlans.js';

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

export type OutletSubscriptionSummary = {
  subscription: {
    _id: mongoose.Types.ObjectId;
    plan: string;
    tier: 'free' | 'premium';
    status: string;
    start_date: Date;
    end_date: Date | null;
    trial_ends_at: Date | null;
    features: any[];
  };
  entitlements: {
    analytics: boolean;
    offers: boolean;
  };
  free_tier: {
    eligible: boolean;
    ends_at: string | null;
    days_remaining: number | null;
  };
  had_paid_plan_before: boolean;
};

export const getOutletSubscriptionSummary = async (
  outletId: string,
  options?: { assignedByUserId?: string; notes?: string }
): Promise<OutletSubscriptionSummary> => {
  const outletObjectId = new mongoose.Types.ObjectId(outletId);

  let subscription: any = await Subscription.findOne({ outlet_id: outletObjectId })
    .sort({ updated_at: -1, created_at: -1 })
    .select('plan status start_date end_date trial_ends_at features');

  if (!subscription) {
    subscription = (await ensureSubscriptionForOutlet(outletId, {
      plan: 'free',
      status: 'active',
      assigned_by: options?.assignedByUserId,
      notes: options?.notes || 'Auto-created on subscription summary access'
    })) as any;
  }

  if (!subscription) {
    throw new Error('Subscription not found');
  }

  const tier = normalizePlanToTier(subscription.plan);
  const isPremium = tier === 'premium';

  const paidPlansLegacy = ['premium', 'basic', 'enterprise'];

  const hadPaidPlanBefore =
    paidPlansLegacy.includes(subscription.plan) ||
    (await SubscriptionHistory.exists({
      outlet_id: outletObjectId,
      new_plan: { $in: paidPlansLegacy }
    }));

  const now = new Date();

  // Two-tier system: analytics/offers are Premium only.
  // Keep `free_tier` in the response for backward compatibility, but it never grants access.
  let freeTierEligible: boolean = false;
  let freeTierEndsAt: Date | null = null;
  let freeTierDaysRemaining: number | null = null;

  const entitlements = {
    analytics: isPremium && (subscription.status === 'active' || subscription.status === 'trial') && hasFeature(subscription.plan, SUBSCRIPTION_FEATURES.ADVANCED_ANALYTICS),
    offers: isPremium && (subscription.status === 'active' || subscription.status === 'trial') && hasFeature(subscription.plan, SUBSCRIPTION_FEATURES.OFFER_MANAGEMENT)
  };

  return {
    subscription: {
      _id: subscription._id,
      plan: subscription.plan,
      tier,
      status: subscription.status,
      start_date: subscription.start_date,
      end_date: subscription.end_date ?? null,
      trial_ends_at: subscription.trial_ends_at ?? null,
      features: subscription.features ?? []
    },
    entitlements,
    free_tier: {
      eligible: freeTierEligible,
      ends_at: (freeTierEndsAt as Date | null)?.toISOString() ?? null,
      days_remaining: freeTierDaysRemaining
    },
    had_paid_plan_before: Boolean(hadPaidPlanBefore)
  };
};
