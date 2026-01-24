import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware.js';
import { Follow } from '../models/Follow.js';
import { Outlet } from '../models/Outlet.js';
import { sendSuccess, sendError } from '../utils/response.js';
import * as outletService from '../services/outletService.js';

export const followOutlet = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const userId = req.user.id;

        const outlet = await outletService.getOutletById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, 404);
        }

        const actualOutletId = outlet._id;

        // Create follow record (using findOneAndUpdate with upsert to avoid duplicates if 1,1 index somehow fails or handling race conditions)
        await Follow.findOneAndUpdate(
            { user: userId, outlet: actualOutletId },
            { $setOnInsert: { user: userId, outlet: actualOutletId } },
            { upsert: true, new: true }
        );

        return sendSuccess(res, { message: 'Followed successfully' });
    } catch (error: any) {
        console.error('Follow outlet error:', error);
        return sendError(res, error.message);
    }
};

export const unfollowOutlet = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const userId = req.user.id;

        const outlet = await outletService.getOutletById(outletId);
        const actualOutletId = outlet ? outlet._id : outletId;

        await Follow.findOneAndDelete({ user: userId, outlet: actualOutletId });

        return sendSuccess(res, { message: 'Unfollowed successfully' });
    } catch (error: any) {
        console.error('Unfollow outlet error:', error);
        return sendError(res, error.message);
    }
};

export const getFollowedOutlets = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const [follows, total] = await Promise.all([
            Follow.find({ user: userId })
                .populate({
                    path: 'outlet',
                    select: 'name banner_image_url cover_image_url brand_id location address',
                    populate: {
                        path: 'brand_id',
                        select: 'logo_url name cuisines'
                    }
                })
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(limit),
            Follow.countDocuments({ user: userId })
        ]);

        return sendSuccess(res, {
            follows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page * limit < total
            }
        });
    } catch (error: any) {
        console.error('Get followed outlets error:', error);
        return sendError(res, error.message);
    }
};

export const getOutletFollowersCount = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const outlet = await outletService.getOutletById(outletId);
        const actualOutletId = outlet ? outlet._id : outletId;
        const count = await Follow.countDocuments({ outlet: actualOutletId });
        return sendSuccess(res, { count });
    } catch (error: any) {
        console.error('Get followers count error:', error);
        return sendError(res, error.message);
    }
};

export const checkFollowStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const userId = req.user.id;

        const outlet = await outletService.getOutletById(outletId);
        const actualOutletId = outlet ? outlet._id : outletId;

        const follow = await Follow.findOne({ user: userId, outlet: actualOutletId });
        return sendSuccess(res, { is_following: !!follow });
    } catch (error: any) {
        console.error('Check follow status error:', error);
        return sendError(res, error.message);
    }
};

export const getFollowedOutletIds = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        // Fetch all follows for the user, selecting only the outlet ID
        const follows = await Follow.find({ user: userId }).select('outlet');
        const outletIds = follows.map(f => f.outlet);
        return sendSuccess(res, { outletIds });
    } catch (error: any) {
        console.error('Get followed outlet IDs error:', error);
        return sendError(res, error.message);
    }
};
