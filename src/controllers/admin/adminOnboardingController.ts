import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response.js';
import * as onboardingService from '../../services/admin/adminOnboardingService.js';
import { AppError } from '../../errors/AppError.js';

export const getOnboardingRequests = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const statusFilter = req.query.status as string;

        const data = await onboardingService.listOnboardingRequests(page, limit, statusFilter);
        return sendSuccess(res, data);
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        console.error('Get onboarding requests error:', error);
        return sendError(res, 'Failed to fetch onboarding requests');
    }
};

export const getOnboardingRequestDetail = async (req: Request, res: Response) => {
    try {
        const data = await onboardingService.getOnboardingRequestDetail(req.params.id);
        return sendSuccess(res, data);
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        console.error('Get onboarding request detail error:', error);
        return sendError(res, 'Failed to fetch onboarding request detail');
    }
};

export const approveOnboardingRequest = async (req: Request, res: Response) => {
    try {
        const reviewerId = (req as any).user?.userId;
        const outlet = await onboardingService.approveOnboardingRequest(req.params.id, reviewerId);
        return sendSuccess(res, outlet, 'Outlet approved successfully');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        console.error('Approve outlet error:', error);
        return sendError(res, 'Failed to approve outlet');
    }
};

export const rejectOnboardingRequest = async (req: Request, res: Response) => {
    try {
        const { reason } = req.body;
        const reviewerId = (req as any).user?.userId;
        const outlet = await onboardingService.rejectOnboardingRequest(req.params.id, reviewerId, reason);
        return sendSuccess(res, outlet, 'Outlet rejected successfully');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        console.error('Reject outlet error:', error);
        return sendError(res, 'Failed to reject outlet');
    }
};
