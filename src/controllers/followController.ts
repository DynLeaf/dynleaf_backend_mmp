import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/authMiddleware.js';
import { Follow } from '../models/Follow.js';
import { Outlet } from '../models/Outlet.js';
import { sendSuccess, sendError } from '../utils/response.js';
import * as outletService from '../services/outletService.js';

// Constants
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

// Helper functions
const calculatePagination = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
  hasMore: page * limit < total
});

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
        const page = parseInt(req.query.page as string) || DEFAULT_PAGE;
        const limit = parseInt(req.query.limit as string) || DEFAULT_LIMIT;
        const skip = (page - 1) * limit;

        // Use aggregation instead of nested populate for better performance
        const [follows, total] = await Promise.all([
            Follow.aggregate([
                { $match: { user: new mongoose.Types.ObjectId(userId) } },
                { $sort: { created_at: -1 } },
                { $skip: skip },
                { $limit: limit },
                {
                    $lookup: {
                        from: 'outlets',
                        localField: 'outlet',
                        foreignField: '_id',
                        as: 'outlet'
                    }
                },
                { $unwind: { path: '$outlet', preserveNullAndEmptyArrays: false } },
                {
                    $lookup: {
                        from: 'brands',
                        localField: 'outlet.brand_id',
                        foreignField: '_id',
                        as: 'outlet.brand'
                    }
                },
                { $unwind: { path: '$outlet.brand', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1,
                        user: 1,
                        outlet: {
                            _id: 1,
                            name: 1,
                            banner_image_url: 1,
                            cover_image_url: 1,
                            location: 1,
                            address: 1,
                            brand: {
                                _id: '$outlet.brand._id',
                                logo_url: '$outlet.brand.logo_url',
                                name: '$outlet.brand.name',
                                cuisines: '$outlet.brand.cuisines'
                            }
                        },
                        created_at: 1
                    }
                }
            ]),
            Follow.countDocuments({ user: userId })
        ]);

        return sendSuccess(res, {
            follows,
            pagination: calculatePagination(page, limit, total)
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

        const follow = await Follow.findOne({ user: userId, outlet: actualOutletId }).lean();
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
