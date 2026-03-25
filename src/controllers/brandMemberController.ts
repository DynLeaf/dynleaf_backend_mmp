import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response.js';
import * as brandMemberService from '../services/brand/brandMemberService.js';

interface AuthRequest extends Request {
    user?: { id: string };
}

export const getBrandMembers = async (req: AuthRequest, res: Response) => {
    try {
        const members = await brandMemberService.getBrandMembers(req.params.brandId, req.user!.id);
        return sendSuccess(res, members);
    } catch (error: unknown) {
        const msg = (error as Error).message;
        if (msg === 'Brand not found') return sendError(res, msg, 404);
        if (msg === 'ACCESS_DENIED') return sendError(res, 'Access denied', 403);
        return sendError(res, msg);
    }
};

export const addBrandMember = async (req: AuthRequest, res: Response) => {
    try {
        const member = await brandMemberService.addBrandMember(req.params.brandId, req.user!.id, req.body as { userId: string; role?: string; permissions?: object; assignedOutlets?: string[] });
        return sendSuccess(res, member, 'Member added successfully', 201);
    } catch (error: unknown) {
        const msg = (error as Error).message;
        if (msg === 'Brand not found') return sendError(res, msg, 404);
        if (msg.startsWith('Only brand owners')) return sendError(res, msg, 403);
        if (msg === 'User is already a member of this brand') return sendError(res, msg, 400);
        return sendError(res, msg);
    }
};

export const updateBrandMemberRole = async (req: AuthRequest, res: Response) => {
    try {
        const member = await brandMemberService.updateBrandMemberRole(
            req.params.brandId, req.user!.id, req.params.userId,
            req.body as { role?: string; permissions?: object; assignedOutlets?: string[] }
        );
        return sendSuccess(res, member, 'Member updated successfully');
    } catch (error: unknown) {
        const msg = (error as Error).message;
        if (msg === 'Brand not found') return sendError(res, msg, 404);
        if (msg.startsWith('Only brand owners')) return sendError(res, msg, 403);
        if (msg === 'Cannot change your own role') return sendError(res, msg, 400);
        if (msg === 'Member not found') return sendError(res, msg, 404);
        return sendError(res, msg);
    }
};

export const removeBrandMember = async (req: AuthRequest, res: Response) => {
    try {
        await brandMemberService.removeBrandMember(req.params.brandId, req.user!.id, req.params.userId);
        return sendSuccess(res, null, 'Member removed successfully');
    } catch (error: unknown) {
        const msg = (error as Error).message;
        if (msg === 'Brand not found') return sendError(res, msg, 404);
        if (msg.startsWith('Only brand owners')) return sendError(res, msg, 403);
        if (msg === 'Cannot remove yourself from the brand') return sendError(res, msg, 400);
        if (msg === 'Member not found') return sendError(res, msg, 404);
        return sendError(res, msg);
    }
};

export const getBrandOutlets = async (req: AuthRequest, res: Response) => {
    try {
        const outlets = await brandMemberService.getBrandOutlets(req.params.brandId, req.user!.id);
        return sendSuccess(res, outlets);
    } catch (error: unknown) {
        const msg = (error as Error).message;
        if (msg === 'Brand not found') return sendError(res, msg, 404);
        if (msg === 'ACCESS_DENIED') return sendError(res, 'Access denied', 403);
        return sendError(res, msg);
    }
};

export const getBrandMemberPermissions = async (req: AuthRequest, res: Response) => {
    try {
        const result = await brandMemberService.getBrandMemberPermissions(req.params.brandId, req.user!.id);
        return sendSuccess(res, result);
    } catch (error: unknown) {
        const msg = (error as Error).message;
        if (msg === 'Brand not found') return sendError(res, msg, 404);
        return sendError(res, msg);
    }
};

export const updateBrandSettings = async (req: AuthRequest, res: Response) => {
    try {
        const result = await brandMemberService.updateBrandSettings(req.params.brandId, req.user!.id, req.body as { allow_cross_user_sync?: boolean });
        return sendSuccess(res, result, 'Brand settings updated successfully');
    } catch (error: unknown) {
        const msg = (error as Error).message;
        if (msg === 'Brand not found') return sendError(res, msg, 404);
        if (msg.startsWith('Only brand owners')) return sendError(res, msg, 403);
        return sendError(res, msg);
    }
};
