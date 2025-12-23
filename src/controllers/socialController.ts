import { Request, Response } from 'express';
import { Outlet } from '../models/Outlet.js';

export const updateSocialLinks = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { socials } = req.body;

        const socialMap: any = {};
        socials.forEach((s: any) => {
            socialMap[s.platform] = s.url;
        });

        await Outlet.findByIdAndUpdate(outletId, { social_media: socialMap });
        res.json({ success: true, message: 'Social links updated' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getProfileFeed = async (req: Request, res: Response) => {
    res.json({ posts: [] });
};

export const getProfilePhotos = async (req: Request, res: Response) => {
    res.json({ photos: [] });
};

export const getProfileReviews = async (req: Request, res: Response) => {
    res.json({ ratingSummary: { average: 0, count: 0 }, reviews: [] });
};
