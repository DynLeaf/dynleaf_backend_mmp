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
    try {
        const { outletId } = req.params;

        const outlet = await Outlet.findById(outletId).select('photo_gallery media');
        
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // Transform photo_gallery structure to flat array with categories
        const photos: Array<{ url: string; category: 'interior' | 'exterior' | 'food' }> = [];

        // Add interior photos
        if (outlet.photo_gallery?.interior && Array.isArray(outlet.photo_gallery.interior)) {
            outlet.photo_gallery.interior.forEach((url: string) => {
                if (url) photos.push({ url, category: 'interior' });
            });
        }

        // Add exterior photos
        if (outlet.photo_gallery?.exterior && Array.isArray(outlet.photo_gallery.exterior)) {
            outlet.photo_gallery.exterior.forEach((url: string) => {
                if (url) photos.push({ url, category: 'exterior' });
            });
        }

        // Add food photos
        if (outlet.photo_gallery?.food && Array.isArray(outlet.photo_gallery.food)) {
            outlet.photo_gallery.food.forEach((url: string) => {
                if (url) photos.push({ url, category: 'food' });
            });
        }

        // Optionally include cover image as exterior photo if available
        if (outlet.media?.cover_image_url && !photos.some(p => p.url === outlet.media?.cover_image_url)) {
            photos.unshift({ url: outlet.media.cover_image_url, category: 'exterior' });
        }

        return sendSuccess(res, { photos });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getProfileReviews = async (req: Request, res: Response) => {
    return sendSuccess(res, { ratingSummary: { average: 0, count: 0 }, reviews: [] });
};
