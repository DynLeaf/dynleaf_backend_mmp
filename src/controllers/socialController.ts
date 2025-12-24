import { Request, Response } from 'express';
import { Outlet } from '../models/Outlet.js';
import { sendSuccess, sendError } from '../utils/response.js';

export const updateSocialLinks = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { socials } = req.body;

        const socialMap: any = {};
        socials.forEach((s: any) => {
            socialMap[s.platform] = s.url;
        });

        await Outlet.findByIdAndUpdate(outletId, { social_media: socialMap });
        return sendSuccess(res, null, 'Social links updated');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getProfileFeed = async (req: Request, res: Response) => {
    return sendSuccess(res, { posts: [] });
};

export const getProfilePhotos = async (req: Request, res: Response) => {
    return sendSuccess(res, { photos: [] });
};

export const getProfileReviews = async (req: Request, res: Response) => {
    return sendSuccess(res, { ratingSummary: { average: 0, count: 0 }, reviews: [] });
};
