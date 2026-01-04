import type { Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest } from '../middleware/authMiddleware.js';

type UploadAssetType =
    | 'brand_logo'
    | 'outlet_cover'
    | 'gallery_interior'
    | 'gallery_exterior'
    | 'gallery_food'
    | 'menu_item'
    | 'story'
    | 'avatar';

const assetTypeToFolder: Record<UploadAssetType, string> = {
    brand_logo: 'brands',
    outlet_cover: 'outlets',
    gallery_interior: 'gallery/interior',
    gallery_exterior: 'gallery/exterior',
    gallery_food: 'gallery/food',
    menu_item: 'menu',
    story: 'stories',
    avatar: 'avatars'
};

const assetTypeToResourceType: Record<UploadAssetType, 'image' | 'auto'> = {
    brand_logo: 'image',
    outlet_cover: 'image',
    gallery_interior: 'image',
    gallery_exterior: 'image',
    gallery_food: 'image',
    menu_item: 'image',
    story: 'auto',
    avatar: 'image'
};

const sha1 = (value: string) => crypto.createHash('sha1').update(value).digest('hex');

const signCloudinaryParams = (params: Record<string, string | number>, apiSecret: string) => {
    const entries = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .sort(([a], [b]) => a.localeCompare(b));

    const paramString = entries.map(([k, v]) => `${k}=${v}`).join('&');
    return sha1(paramString + apiSecret);
};

export const getCloudinarySignature = async (req: AuthRequest, res: Response) => {
    try {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;

        if (!cloudName || !apiKey || !apiSecret) {
            return res.status(500).json({
                status: false,
                data: null,
                message: 'Cloudinary is not configured on server',
                error: 'Missing CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET'
            });
        }

        const { assetType } = (req.body || {}) as { assetType?: UploadAssetType };

        if (!assetType || !(assetType in assetTypeToFolder)) {
            return res.status(400).json({
                status: false,
                data: null,
                message: 'Invalid assetType',
                error:
                    "assetType must be one of: 'brand_logo','outlet_cover','gallery_interior','gallery_exterior','gallery_food','menu_item','story','avatar'"
            });
        }

        const folder = assetTypeToFolder[assetType as UploadAssetType];
        const resourceType = assetTypeToResourceType[assetType as UploadAssetType];

        const userId = req.user?.id || 'anonymous';
        const publicId = `${folder}/${userId}/${uuidv4()}`;
        const timestamp = Math.floor(Date.now() / 1000);

        const signature = signCloudinaryParams(
            {
                folder,
                public_id: publicId,
                timestamp
            },
            apiSecret
        );

        return res.json({
            status: true,
            data: {
                cloudName,
                apiKey,
                timestamp,
                signature,
                folder,
                publicId,
                resourceType,
                uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`
            },
            message: 'Signature generated',
            error: null
        });
    } catch (error: any) {
        return res.status(500).json({
            status: false,
            data: null,
            message: 'Failed to generate signature',
            error: error?.message || 'Unknown error'
        });
    }
};
