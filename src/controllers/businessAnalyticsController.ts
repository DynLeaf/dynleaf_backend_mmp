import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response.js';
import { resolveAnalyticsWindow } from '../utils/analyticsRange.js';
import { getBusinessDashboard } from '../services/analytics/outletAnalyticsService.js';
import { AppError } from '../errors/AppError.js';

export const getOutletDashboardAnalytics = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const window = resolveAnalyticsWindow(req.query);
        const days = Math.max(1, Math.round((window.end.getTime() - window.start.getTime()) / (1000 * 60 * 60 * 24)));

        const data = await getBusinessDashboard(outletId, (req as any).user, window.range, window.start, window.end, days);

        return sendSuccess(res, data, 'Dashboard analytics');
    } catch (error: unknown) {
        if (error instanceof AppError) {
            return sendError(res, error.message, null, error.statusCode);
        }
        console.error('Dashboard analytics error:', error);
        return sendError(res, 'Failed to load dashboard analytics');
    }
};

export const getOutletReports = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const window = resolveAnalyticsWindow(req.query);
        const days = Math.max(1, Math.round((window.end.getTime() - window.start.getTime()) / (1000 * 60 * 60 * 24)));

        const data = await getBusinessDashboard(outletId, (req as any).user, window.range, window.start, window.end, days);

        // Reports often restructure this data, we provide a unified structure
        return sendSuccess(res, {
            summary: data.kpis,
            funnel: data.funnel,
            audience: data.audience,
            series: data.series
        }, 'Outlet reports generated');
    } catch (error: unknown) {
        if (error instanceof AppError) {
            return sendError(res, error.message, null, error.statusCode);
        }
        console.error('Report generation error:', error);
        return sendError(res, 'Failed to generate reports');
    }
};
