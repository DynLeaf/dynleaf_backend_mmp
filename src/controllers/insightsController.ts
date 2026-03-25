import { Request, Response } from 'express';
import * as insightsService from '../services/analytics/insightsService.js';
import { sendError, sendSuccess } from '../utils/response.js';

export const getOutletInsights = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const userId = (req as any).user?.id;
        const result = await insightsService.getOutletInsights(outletId, req.query, userId);

        const response = {
            outlet: { id: result.outlet._id, name: result.outlet.name },
            subscription: {
                tier: result.tier,
                plan: result.subscription.plan,
                status: result.subscription.status,
                is_premium: result.isPremium,
            },
            time_range: result.insightsData.time_range,
            period: { start: result.insightsData.period_start, end: result.insightsData.period_end },
            computed_at: result.insightsData.computed_at,
            data_age_minutes: Math.floor((Date.now() - result.insightsData.computed_at.getTime()) / 1000 / 60),
            metrics: {
                total_visits: result.insightsData.total_visits,
                total_menu_views: result.insightsData.total_menu_views,
                total_profile_views: result.insightsData.total_profile_views,
                unique_visitors: result.insightsData.unique_visitors,
            },
            top_food_item: result.insightsData.top_food_item,
            device_breakdown: result.insightsData.device_breakdown,
            trends: result.insightsData.trends,
            premium: result.isPremium ? result.insightsData.premium_data : null,
            locked_features: !result.isPremium ? {
                message: 'Upgrade to Premium to unlock advanced insights',
                features: [
                    'Conversion funnel analysis', 'New vs returning visitors', 'Traffic source breakdown',
                    'All food items performance', 'Offer & promotion analytics', 'Daily trends charts',
                    'Peak hours analysis', 'Geographic breakdown', 'Custom time ranges (30d, 90d)', 'Real-time data refresh',
                ],
                upgrade_url: '/subscription/upgrade',
            } : null,
        };

        return sendSuccess(res, response);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const triggerInsightsComputation = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { range = '7d', start, end } = req.query;
        const result = await insightsService.triggerComputation(outletId, range as string, start as string, end as string);
        return sendSuccess(res, {
            message: 'Insights computed successfully',
            outlet_id: outletId,
            time_range: range,
            duration_ms: result.duration,
        });
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const getInsightsMetadata = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const metadata = await insightsService.getMetadata(outletId);
        return sendSuccess(res, { outlet_id: outletId, summaries: metadata, latest: metadata[0] || null });
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};
