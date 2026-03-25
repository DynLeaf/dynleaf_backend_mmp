import { Request, Response } from 'express';
import { storyService } from '../../services/story/storyService.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { CreateStoryRequestDto } from '../../dto/story/createStory.request.dto.js';
import * as outletService from '../../services/outletService.js';

// Helper for access control (could be moved to a utility or service)
const checkOutletAccess = async (user: any, outletId: string): Promise<boolean> => {
    if (user.activeRole?.role === 'admin') return true;
    const roles: any[] = Array.isArray(user.roles) ? user.roles : [];
    
    const hasDirectAccess = roles.some((r: any) => 
        (r?.role === 'admin') || (r?.scope === 'outlet' && r?.outletId?.toString() === outletId)
    );
    if (hasDirectAccess) return true;

    const outlet = await outletService.getOutletById(outletId);
    if (!outlet) return false;

    const outletBrandId = outlet.brand_id?.toString();
    if (outletBrandId) {
        if (roles.some((r: any) => r?.scope === 'brand' && r?.brandId?.toString() === outletBrandId)) return true;
    }

    if (outlet.created_by_user_id?.toString() === user.id) return true;
    if (outlet.managers?.some((m: any) => m?.user_id?.toString() === user.id)) return true;

    return false;
};

export const createStory = async (req: AuthRequest, res: Response) => {
    try {
        const dto: CreateStoryRequestDto = req.body;
        if (!dto.outletId || !dto.slides || dto.slides.length === 0 || !dto.category) {
            return sendError(res, 'Missing required fields', 400);
        }

        const hasAccess = await checkOutletAccess(req.user!, dto.outletId);
        if (!hasAccess) {
            return sendError(res, 'Unauthorized to create story for this outlet', 403);
        }

        const story = await storyService.createStory(req.user!.id, dto);
        return sendSuccess(res, story, 'Story created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message, error.statusCode || 500);
    }
};

export const getOutletStories = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const stories = await storyService.getOutletStories(outletId);
        return sendSuccess(res, stories);
    } catch (error: any) {
        return sendError(res, error.message, error.statusCode || 500);
    }
};

export const deleteStory = async (req: AuthRequest, res: Response) => {
    try {
        const { storyId } = req.params;
        // In a full refactor, ownership check should be inside the service
        await storyService.deleteStory(storyId);
        return sendSuccess(res, null, 'Story deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message, error.statusCode || 500);
    }
};

export const getStoryFeed = async (req: Request, res: Response) => {
    try {
        const { latitude, longitude, radius, userId } = req.query;
        const feed = await storyService.getStoryFeed(
            longitude ? parseFloat(longitude as string) : undefined,
            latitude ? parseFloat(latitude as string) : undefined,
            radius ? parseInt(radius as string) : undefined,
            userId as string
        );
        return sendSuccess(res, feed);
    } catch (error: any) {
        return sendError(res, error.message, error.statusCode || 500);
    }
};

export const getAdminOutletStories = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const hasAccess = await checkOutletAccess(req.user!, outletId);
        if (!hasAccess) return sendError(res, 'Unauthorized', 403);

        const stories = await storyService.getAdminOutletStories(outletId);
        return sendSuccess(res, stories);
    } catch (error: any) {
        return sendError(res, error.message, error.statusCode || 500);
    }
};

export const updateStoryStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { storyId } = req.params;
        const { status, pinned } = req.body;

        const story = await storyService.updateStoryStatus(storyId, status, pinned);
        return sendSuccess(res, story, 'Story updated successfully');
    } catch (error: any) {
        return sendError(res, error.message, error.statusCode || 500);
    }
};
