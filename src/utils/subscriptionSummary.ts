import mongoose from 'mongoose';
import { Subscription, SubscriptionHistory } from '../models/Subscription.js';
import { ensureSubscriptionForOutlet } from './subscriptionUtils.js';

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

export type OutletSubscriptionSummary = {
  subscription: {
    _id: mongoose.Types.ObjectId;
    plan: string;
    status: string;
    start_date: Date;
    end_date: Date | null;
    trial_ends_at: Date | null;
    features: any[];
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

  const paidPlans = ['basic', 'premium', 'enterprise'];

  const hadPaidPlanBefore =
    paidPlans.includes(subscription.plan) ||
    (await SubscriptionHistory.exists({
      outlet_id: outletObjectId,
      new_plan: { $in: paidPlans }
    }));

  const now = new Date();

  const freeTierEligible = subscription.plan === 'free' && !hadPaidPlanBefore;
  const freeTierEndsAt = freeTierEligible ? addDays(new Date(subscription.start_date), 30) : null;

  const freeTierDaysRemaining = freeTierEndsAt
    ? Math.max(0, Math.ceil((freeTierEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    subscription: {
      _id: subscription._id,
      plan: subscription.plan,
      status: subscription.status,
      start_date: subscription.start_date,
      end_date: subscription.end_date ?? null,
      trial_ends_at: subscription.trial_ends_at ?? null,
      features: subscription.features ?? []
    },
    free_tier: {
      eligible: freeTierEligible,
      ends_at: freeTierEndsAt ? freeTierEndsAt.toISOString() : null,
      days_remaining: freeTierDaysRemaining
    },
    had_paid_plan_before: Boolean(hadPaidPlanBefore)
  };
};
