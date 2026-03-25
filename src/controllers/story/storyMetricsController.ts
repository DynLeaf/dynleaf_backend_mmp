import { Request, Response } from 'express';
import { storyMetricsService } from '../../services/story/storyMetricsService.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/authMiddleware.js';

export const recordView = async (req: Request, res: Response) => {
    try {
        const { storyId } = req.params;
        const { userId, completedAllSlides } = req.body;

        if (!userId) {
            return sendError(res, 'userId is required', 400);
        }

        const result = await storyMetricsService.recordView(userId, storyId, !!completedAllSlides);
        return sendSuccess(res, result, 'View recorded');
    } catch (error: any) {
        return sendError(res, error.message, error.statusCode || 500);
    }
};

export const getSeenStatus = async (req: Request, res: Response) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return sendError(res, 'userId is required', 400);
        }

        const viewedStories = await storyMetricsService.getSeenStatus(String(userId));
        return sendSuccess(res, viewedStories);
    } catch (error: any) {
        return sendError(res, error.message, error.statusCode || 500);
    }
};

export const getStoryAnalytics = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        
        // Potential check for outlet access could be moved to a middleware or service
        const analytics = await storyMetricsService.getStoryAnalytics(outletId);
        return sendSuccess(res, analytics);
    } catch (error: any) {
        return sendError(res, error.message, error.statusCode || 500);
    }
};
