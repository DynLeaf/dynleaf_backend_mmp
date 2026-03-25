import mongoose from 'mongoose';
import * as outletRepo from '../../repositories/outletRepository.js';
import * as outletInsightsSummaryRepo from '../../repositories/analytics/outletInsightsSummaryRepository.js';
import { Subscription } from '../../models/Subscription.js';
import { InsightsComputationService } from '../../services/insightsComputationService.js';
import { ensureSubscriptionForOutlet } from '../../utils/subscriptionUtils.js';
import { normalizePlanToTier } from '../../config/subscriptionPlans.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';

import type { IOutletInsightsSummary } from '../../types/analytics.js';

export const getOutletInsights = async (outletId: string, options: { range?: string; realtime?: boolean | string; start?: string; end?: string }, userId?: string) => {
    const { range = '7d', start: customStart, end: customEnd } = options;
    const realtime = options.realtime === true || options.realtime === 'true';
    const outletObjectId = new mongoose.Types.ObjectId(outletId);

    const outlet = await outletRepo.findById(outletId);
    if (!outlet) throw new AppError('Outlet not found', 404);

    let subscription = await outletRepo.findSubscriptionByOutletId(outletId);
    if (!subscription) {
        subscription = await ensureSubscriptionForOutlet(outletId, { plan: 'free', status: 'active', assigned_by: userId }) as any;
    }

    if (!subscription) throw new AppError('Failed to resolve subscription', 500);

    if (!outlet.subscription_id || outlet.subscription_id.toString() !== (subscription as any)._id.toString()) {
        await outletRepo.updateById(outletId, { subscription_id: (subscription as any)._id });
    }

    const tier = normalizePlanToTier(subscription.plan);
    const isPremium = tier === 'premium' && ['active', 'trial'].includes(subscription.status);

    const premiumRanges = ['30d', '90d', 'today'];
    if (!isPremium && premiumRanges.includes(range)) {
        throw new AppError('Premium subscription required for this time range', 403);
    }

    let insightsData: IOutletInsightsSummary | null = null;
    if (range === 'today') {
        await outletInsightsSummaryRepo.deleteMany({ outlet_id: outletObjectId, time_range: 'today' });
        await InsightsComputationService.computeForOutlet(outletId, range as any, customStart, customEnd);
        insightsData = await outletInsightsSummaryRepo.findOne({ outlet_id: outletObjectId, time_range: range }) as any;
    } else if (realtime && isPremium) {
        await InsightsComputationService.computeForOutlet(outletId, range as any, customStart, customEnd);
        insightsData = await outletInsightsSummaryRepo.findOne({ outlet_id: outletObjectId, time_range: range }) as any;
    } else {
        insightsData = await outletInsightsSummaryRepo.findOne({ outlet_id: outletObjectId, time_range: range }) as any;
        if (!insightsData) {
            await InsightsComputationService.computeForOutlet(outletId, range as any, customStart, customEnd);
            insightsData = await outletInsightsSummaryRepo.findOne({ outlet_id: outletObjectId, time_range: range }) as any;
        }
    }

    if (!insightsData) throw new AppError('No insights data available', 404);

    return { insightsData, outlet, subscription, tier, isPremium };
};

export const triggerComputation = async (outletId: string, range: string, customStart?: string, customEnd?: string) => {
    const outletObjectId = new mongoose.Types.ObjectId(outletId);
    const subscription = await outletRepo.findSubscriptionByOutletId(outletId);
    if (!subscription) throw new AppError('No subscription found', 403);

    const tier = normalizePlanToTier(subscription.plan);
    const isPremium = tier === 'premium' && ['active', 'trial'].includes(subscription.status);
    if (!isPremium) throw new AppError('Premium subscription required', 403);

    const result = await InsightsComputationService.computeForOutlet(outletId, range as any, customStart, customEnd);
    if (!result.success) throw new AppError('Computation failed', 400);

    return result;
};

export const getMetadata = async (outletId: string) => {
    const outletObjectId = new mongoose.Types.ObjectId(outletId);
    const summaries = await outletInsightsSummaryRepo.find({ outlet_id: outletObjectId });

    return (summaries as any[]).map(s => ({
        time_range: s.time_range,
        computed_at: s.computed_at,
        age_minutes: Math.floor((Date.now() - s.computed_at.getTime()) / 1000 / 60),
        status: s.status,
        duration_ms: s.computation_duration_ms,
        events_processed: s.events_processed,
        error: (s as unknown as { error_message?: string }).error_message || null,
    }));
};
