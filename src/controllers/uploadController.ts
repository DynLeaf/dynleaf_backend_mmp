import type { Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest } from '../middleware/authMiddleware.js';
import { sendSuccess, sendError } from '../utils/response.js';

type UploadAssetType =
    | 'brand_logo'
    | 'outlet_cover'
    | 'gallery_interior'
    | 'gallery_exterior'
    | 'gallery_food'
    | 'menu_item'
    | 'story'
    | 'avatar'
    | 'reel_thumbnail';

// Constants
const CLOUDINARY_ENV_VARS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const;
const VALID_ASSET_TYPES = [
  'brand_logo', 'outlet_cover', 'gallery_interior', 'gallery_exterior',
  'gallery_food', 'menu_item', 'story', 'avatar', 'reel_thumbnail'
] as const;

const assetTypeToFolder: Record<UploadAssetType, string> = {
    brand_logo: 'brands',
    outlet_cover: 'outlets',
    gallery_interior: 'gallery/interior',
    gallery_exterior: 'gallery/exterior',
    gallery_food: 'gallery/food',
    menu_item: 'menu',
    story: 'stories',
    avatar: 'avatars',
    reel_thumbnail: 'reels'
};

const assetTypeToResourceType: Record<UploadAssetType, 'image' | 'auto' | 'video'> = {
    brand_logo: 'image',
    outlet_cover: 'image',
    gallery_interior: 'image',
    gallery_exterior: 'image',
    gallery_food: 'image',
    menu_item: 'image',
    story: 'auto',
    avatar: 'image',
    reel_thumbnail: 'image'
};

// Cloudinary upload-time transformations to reduce *stored* asset sizes.
// Note: these are visually-lossy but typically indistinguishable (TinyPNG-style).
const assetTypeToUploadTransformation: Partial<Record<UploadAssetType, string>> = {
    // Logos often contain sharp edges; keep larger max and rely on q_auto.
    brand_logo: 'c_limit,w_2048,h_2048,q_auto:good,f_auto',
    outlet_cover: 'c_limit,w_2048,h_2048,q_auto:good,f_auto',
    gallery_interior: 'c_limit,w_2048,h_2048,q_auto:good,f_auto',
    gallery_exterior: 'c_limit,w_2048,h_2048,q_auto:good,f_auto',
    gallery_food: 'c_limit,w_2048,h_2048,q_auto:good,f_auto',
    menu_item: 'c_limit,w_2048,h_2048,q_auto:good,f_auto',
    // Avatar typically displayed small; cap harder.
    avatar: 'c_limit,w_512,h_512,q_auto:good,f_auto',
    // Stories can be portrait; only used when the story is an image.
    story: 'c_limit,w_1080,h_1920,q_auto:good,f_auto',
    // Reel thumbnails are displayed in cards; optimize for 16:9 display
    reel_thumbnail: 'c_limit,w_1280,h_720,q_auto:good,f_auto'
};

const sha1 = (value: string) => crypto.createHash('sha1').update(value).digest('hex');

const signCloudinaryParams = (params: Record<string, string | number>, apiSecret: string) => {
    const entries = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .sort(([a], [b]) => a.localeCompare(b));

    const paramString = entries.map(([k, v]) => `${k}=${v}`).join('&');
    return sha1(paramString + apiSecret);
};

// Helper functions
const validateCloudinaryConfig = (cloudName?: string, apiKey?: string, apiSecret?: string): boolean => {
  return !!(cloudName && apiKey && apiSecret);
};

const isValidAssetType = (assetType: any): assetType is UploadAssetType => {
  return assetType && (VALID_ASSET_TYPES as readonly string[]).includes(assetType);
};

const determineResourceType = (assetType: UploadAssetType, mimeType?: string): 'image' | 'video' | 'auto' => {
  if (assetType === 'story' && mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    return 'auto';
  }
  return assetTypeToResourceType[assetType];
};

export const getCloudinarySignature = async (req: AuthRequest, res: Response) => {
    try {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;

        if (!validateCloudinaryConfig(cloudName, apiKey, apiSecret)) {
            return sendError(res, 'Cloudinary is not configured on server', 
                'Missing CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET', 500);
        }

        const { assetType, mimeType } = (req.body || {}) as { assetType?: UploadAssetType; mimeType?: string };

        if (!isValidAssetType(assetType)) {
            return sendError(res, 'Invalid assetType',
                `assetType must be one of: ${VALID_ASSET_TYPES.join(', ')}`, 400);
        }

        const folder = assetTypeToFolder[assetType];
        const resourceType = determineResourceType(assetType, mimeType);

        const transformation =
            resourceType === 'image' ? assetTypeToUploadTransformation[assetType as UploadAssetType] : undefined;

        const userId = req.user?.id || 'anonymous';
        const publicId = `${folder}/${userId}/${uuidv4()}`;
        const timestamp = Math.floor(Date.now() / 1000);

        const signatureParams: Record<string, string | number> = {
            folder,
            public_id: publicId,
            timestamp
        };

        if (transformation) {
            signatureParams.transformation = transformation;
        }

        const signature = signCloudinaryParams(signatureParams, apiSecret!);

        return sendSuccess(res, {
            cloudName,
            apiKey,
            timestamp,
            signature,
            folder,
            publicId,
            resourceType,
            transformation,
            uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`
        }, 'Signature generated');
    } catch (error: any) {
        return sendError(res, 'Failed to generate signature', error?.message || 'Unknown error');
    }
};
