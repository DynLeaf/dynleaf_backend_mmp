import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Outlet } from '../models/Outlet.js';
import { Subscription, ISubscription } from '../models/Subscription.js';
import { OutletInsightsSummary } from '../models/OutletInsightsSummary.js';
import { InsightsComputationService } from '../services/insightsComputationService.js';
import { ensureSubscriptionForOutlet } from '../utils/subscriptionUtils.js';
import { sendError, sendSuccess } from '../utils/response.js';
import { normalizePlanToTier } from '../config/subscriptionPlans.js';

/**
 * Controller for outlet insights with freemium gating
 * Free tier: Limited metrics from pre-computed data
 * Premium tier: Full metrics with real-time option
 */

/**
 * Get insights for an outlet
 * GET /api/outlets/:outletId/insights?range=7d&realtime=false
 * GET /api/outlets/:outletId/insights?range=custom&start=2024-01-01&end=2024-01-31
 */
export const getOutletInsights = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const range = (req.query.range as '7d' | '30d' | '90d' | 'today' | 'custom') || '7d';
        const realtime = req.query.realtime === 'true';
        const customStart = req.query.start as string;
        const customEnd = req.query.end as string;

        // Validate outlet
        const outlet = await Outlet.findById(outletId).select('name subscription_id');
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // Get subscription
        const outletObjectId = new mongoose.Types.ObjectId(outletId);
        let subscription: ISubscription | null = await Subscription.findOne({ outlet_id: outletObjectId }).sort({
            updated_at: -1,
            created_at: -1,
        });

        if (!subscription) {
            subscription = await ensureSubscriptionForOutlet(outletId, {
                plan: 'free',
                status: 'active',
                assigned_by: (req as any).user?.id,
                notes: 'Auto-created on insights access',
            });
        }

        // Sync subscription_id if needed
        if (!outlet.subscription_id || outlet.subscription_id.toString() !== subscription._id.toString()) {
            outlet.subscription_id = subscription._id;
            await outlet.save();
        }

        // Determine tier
        const tier = normalizePlanToTier(subscription.plan);
        const isPremium = tier === 'premium' && ['active', 'trial'].includes(subscription.status);

        // Validate time range access - only 7d for free tier
        const premiumRanges = ['30d', '90d', 'today', 'custom'];
        if (!isPremium && premiumRanges.includes(range)) {
            return sendError(
                res,
                'Premium subscription required for this time range',
                {
                    required_plan: 'premium',
                    current_plan: tier,
                    allowed_ranges: ['7d'],
                    requested_range: range,
                },
                403
            );
        }

        // Validate custom range parameters
        if (range === 'custom' && (!customStart || !customEnd)) {
            return sendError(res, 'Custom range requires start and end dates', {
                required_params: ['start', 'end'],
            });
        }

        // Get insights data
        let insightsData;

        // On-demand range: "today" - ALWAYS compute fresh, NEVER use cached
        if (range === 'today') {
            // Delete any old cached "today" data first
            await OutletInsightsSummary.deleteMany({
                outlet_id: outletObjectId,
                time_range: 'today'
            });

            // Always compute fresh for today
            console.log(`[Insights] On-demand fresh computation for outlet ${outletId}, range today`);
            const result = await InsightsComputationService.computeForOutlet(outletId, range, customStart, customEnd);

            if (!result.success) {
                return sendError(res, 'Failed to compute insights', { error: result.error });
            }

            // Fetch the just-computed data
            insightsData = await OutletInsightsSummary.findOne({
                outlet_id: outletObjectId,
                time_range: range,
            }).sort({ computed_at: -1 });

        } else if (realtime && isPremium) {
            // Real-time computation (premium only)
            console.log(`[Insights] Real-time computation for outlet ${outletId}, range ${range}`);
            const result = await InsightsComputationService.computeForOutlet(outletId, range, customStart, customEnd);

            if (!result.success) {
                return sendError(res, 'Failed to compute insights', { error: result.error });
            }

            insightsData = await OutletInsightsSummary.findOne({
                outlet_id: outletObjectId,
                time_range: range,
            }).sort({ computed_at: -1 });
        } else {
            // Use pre-computed data
            insightsData = await OutletInsightsSummary.findOne({
                outlet_id: outletObjectId,
                time_range: range,
            }).sort({ computed_at: -1 });

            if (!insightsData) {
                // No pre-computed data, compute on-demand
                console.log(`[Insights] No pre-computed data for outlet ${outletId}, computing now...`);
                const result = await InsightsComputationService.computeForOutlet(outletId, range, customStart, customEnd);

                if (!result.success) {
                    return sendError(res, 'Failed to compute insights', { error: result.error });
                }

                insightsData = await OutletInsightsSummary.findOne({
                    outlet_id: outletObjectId,
                    time_range: range,
                }).sort({ computed_at: -1 });
            }
        }

        if (!insightsData) {
            return sendError(res, 'No insights data available');
        }

        // Build response based on tier
        const response = {
            outlet: {
                id: outlet._id,
                name: outlet.name,
            },
            subscription: {
                tier,
                plan: subscription.plan,
                status: subscription.status,
                is_premium: isPremium,
            },
            time_range: range,
            period: {
                start: insightsData.period_start,
                end: insightsData.period_end,
            },
            computed_at: insightsData.computed_at,
            data_age_minutes: Math.floor((Date.now() - insightsData.computed_at.getTime()) / 1000 / 60),

            // Basic metrics (available to all tiers)
            metrics: {
                total_visits: insightsData.total_visits,
                total_menu_views: insightsData.total_menu_views,
                total_profile_views: insightsData.total_profile_views,
                unique_visitors: insightsData.unique_visitors,
            },

            // Top food item (only #1 for free tier)
            top_food_item: insightsData.top_food_item,

            // Device breakdown (available to all tiers)
            device_breakdown: insightsData.device_breakdown,

            // Trends (available to all tiers)
            trends: insightsData.trends,

            // Premium data (only for premium tier)
            premium: isPremium
                ? {
                    funnel: insightsData.premium_data.funnel,
                    audience: insightsData.premium_data.audience,
                    sources: insightsData.premium_data.sources,
                    entry_pages: insightsData.premium_data.entry_pages,
                    top_food_items: insightsData.premium_data.top_food_items,
                    offers: insightsData.premium_data.offers,
                    promotions: insightsData.premium_data.promotions,
                    daily_series: insightsData.premium_data.daily_series,
                    peak_hours: insightsData.premium_data.peak_hours,
                    geographic: insightsData.premium_data.geographic,
                }
                : null,

            // Locked features info for free tier
            locked_features: !isPremium
                ? {
                    message: 'Upgrade to Premium to unlock advanced insights',
                    features: [
                        'Conversion funnel analysis',
                        'New vs returning visitors',
                        'Traffic source breakdown',
                        'All food items performance',
                        'Offer & promotion analytics',
                        'Daily trends charts',
                        'Peak hours analysis',
                        'Geographic breakdown',
                        'Custom time ranges (30d, 90d)',
                        'Real-time data refresh',
                    ],
                    upgrade_url: '/subscription/upgrade',
                }
                : null,
        };

        return sendSuccess(res, response);
    } catch (error: any) {
        console.error('[Insights] Error fetching insights:', error);
        return sendError(res, error.message || 'Failed to fetch insights');
    }
};

/**
 * Manually trigger insights computation for an outlet
 * POST /api/outlets/:outletId/insights/compute?range=7d
 * Premium only
 */
export const triggerInsightsComputation = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const range = (req.query.range as '7d' | '30d' | '90d' | 'today' | 'custom') || '7d';
        const customStart = req.query.start as string;
        const customEnd = req.query.end as string;

        // Validate outlet
        const outlet = await Outlet.findById(outletId).select('subscription_id');
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // Check subscription
        const outletObjectId = new mongoose.Types.ObjectId(outletId);
        const subscription = await Subscription.findOne({ outlet_id: outletObjectId }).sort({
            updated_at: -1,
        });

        if (!subscription) {
            return sendError(res, 'No subscription found', 403);
        }

        const tier = normalizePlanToTier(subscription.plan);
        const isPremium = tier === 'premium' && ['active', 'trial'].includes(subscription.status);

        if (!isPremium) {
            return sendError(
                res,
                'Premium subscription required to trigger manual computation',
                {
                    required_plan: 'premium',
                    current_plan: tier,
                },
                403
            );
        }

        // Trigger computation
        console.log(`[Insights] Manual computation triggered for outlet ${outletId}, range ${range}`);
        const result = await InsightsComputationService.computeForOutlet(outletId, range, customStart, customEnd);

        if (!result.success) {
            return sendError(res, 'Computation failed', { error: result.error });
        }

        return sendSuccess(res, {
            message: 'Insights computed successfully',
            outlet_id: outletId,
            time_range: range,
            duration_ms: result.duration,
        });
    } catch (error: any) {
        console.error('[Insights] Error triggering computation:', error);
        return sendError(res, error.message || 'Failed to trigger computation');
    }
};

/**
 * Get insights metadata (last computation time, status, etc.)
 * GET /api/outlets/:outletId/insights/meta
 */
export const getInsightsMetadata = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;

        const outletObjectId = new mongoose.Types.ObjectId(outletId);

        const summaries = await OutletInsightsSummary.find({
            outlet_id: outletObjectId,
        })
            .sort({ computed_at: -1 })
            .limit(10)
            .select('time_range computed_at status computation_duration_ms events_processed error_message');

        const metadata = summaries.map((s) => ({
            time_range: s.time_range,
            computed_at: s.computed_at,
            age_minutes: Math.floor((Date.now() - s.computed_at.getTime()) / 1000 / 60),
            status: s.status,
            duration_ms: s.computation_duration_ms,
            events_processed: s.events_processed,
            error: s.error_message || null,
        }));

        return sendSuccess(res, {
            outlet_id: outletId,
            summaries: metadata,
            latest: metadata[0] || null,
        });
    } catch (error: any) {
        console.error('[Insights] Error fetching metadata:', error);
        return sendError(res, error.message || 'Failed to fetch metadata');
    }
};
