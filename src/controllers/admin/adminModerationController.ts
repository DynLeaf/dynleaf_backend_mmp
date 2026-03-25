import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response.js';
import * as moderationService from '../../services/admin/adminModerationService.js';
import { AppError } from '../../errors/AppError.js';

export const getModerationStories = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const data = await moderationService.listModerationStories(page, limit);
        return sendSuccess(res, data);
    } catch (error: unknown) {
        return sendError(res, (error as any).message);
    }
};

export const approveStory = async (req: Request, res: Response) => {
    try {
        const data = await moderationService.approveStory(req.params.id);
        return sendSuccess(res, data, 'Story approved');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};

export const rejectStory = async (req: Request, res: Response) => {
    try {
        const data = await moderationService.rejectStory(req.params.id, req.body.reason);
        return sendSuccess(res, data, 'Story rejected');
    } catch (error: unknown) {
        if (error instanceof AppError) return sendError(res, error.message, null, error.statusCode);
        return sendError(res, (error as any).message);
    }
};
