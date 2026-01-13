import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware.js';
import { Follow } from '../models/Follow.js';
import { Outlet } from '../models/Outlet.js';
import { sendSuccess, sendError } from '../utils/response.js';

export const followOutlet = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const userId = req.user.id;

        // Check if outlet exists
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, 404);
        }

        // Create follow record (using findOneAndUpdate with upsert to avoid duplicates if 1,1 index somehow fails or handling race conditions)
        await Follow.findOneAndUpdate(
            { user: userId, outlet: outletId },
            { $setOnInsert: { user: userId, outlet: outletId } },
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

        await Follow.findOneAndDelete({ user: userId, outlet: outletId });

        return sendSuccess(res, { message: 'Unfollowed successfully' });
    } catch (error: any) {
        console.error('Unfollow outlet error:', error);
        return sendError(res, error.message);
    }
};

export const getFollowedOutlets = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const follows = await Follow.find({ user: userId })
            .populate({
                path: 'outlet',
                select: 'name banner_image_url brand_id location address'
            })
            .sort({ created_at: -1 });

        return sendSuccess(res, { follows });
    } catch (error: any) {
        console.error('Get followed outlets error:', error);
        return sendError(res, error.message);
    }
};

export const getOutletFollowersCount = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const count = await Follow.countDocuments({ outlet: outletId });
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

        const follow = await Follow.findOne({ user: userId, outlet: outletId });
        return sendSuccess(res, { is_following: !!follow });
    } catch (error: any) {
        console.error('Check follow status error:', error);
        return sendError(res, error.message);
    }
};
