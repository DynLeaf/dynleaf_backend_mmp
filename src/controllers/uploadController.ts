import type { Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest } from '../middleware/authMiddleware.js';
import { sendSuccess, sendError } from '../utils/response.js';
<<<<<<< Updated upstream
import { getS3Service } from '../services/s3Service.js';
=======
>>>>>>> Stashed changes

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

/**
 * Generate S3 presigned URL for browser uploads
 * Replaces Cloudinary signature generation
 */
export const getS3Signature = async (req: AuthRequest, res: Response) => {
    try {
        const s3Service = getS3Service();
        const { assetType, mimeType } = (req.body || {}) as { assetType?: UploadAssetType; mimeType?: string };

        if (!isValidAssetType(assetType)) {
            return sendError(res, 'Invalid assetType',
                `assetType must be one of: ${VALID_ASSET_TYPES.join(', ')}`, 400);
        }

        const userId = req.user?.id || 'anonymous';
        
        // Determine content type
        const contentType = mimeType || 'application/octet-stream';
        
        // Set file size limits based on asset type
        const fileSizeLimits: Record<UploadAssetType, number> = {
            brand_logo: 104857600, // 100MB
            outlet_cover: 104857600, // 100MB
            gallery_interior: 104857600, // 100MB
            gallery_exterior: 104857600, // 100MB
            gallery_food: 104857600, // 100MB
            menu_item: 104857600, // 100MB
            story: 524288000, // 500MB for videos
            avatar: 104857600, // 100MB
            reel_thumbnail: 104857600 // 100MB
        };

        const maxFileSize = fileSizeLimits[assetType];

        // Generate presigned URL for direct S3 upload
        const presignedResponse = await s3Service.generatePresignedPostUrl(
            assetType,
            userId,
            contentType,
            maxFileSize
        );

        return sendSuccess(res, {
            uploadUrl: presignedResponse.uploadUrl,
            s3Key: presignedResponse.s3Key,
            bucketName: presignedResponse.bucketName,
            region: process.env.AWS_REGION || 'ap-south-2',
            provider: 's3',
            maxFileSize,
            expiresIn: 900 // 15 minutes
        }, 'S3 presigned URL generated');
    } catch (error: any) {
        return sendError(res, 'Failed to generate S3 signature', error?.message || 'Unknown error', 500);
    }
};

/**
 * Upload file to S3 via backend (bypasses CORS issues)
 * Frontend sends base64-encoded file, backend uploads to S3
 * Returns ONLY the S3 key, not the full URL
 */
export const uploadViaBackend = async (req: AuthRequest, res: Response) => {
    try {
        const s3Service = getS3Service();
        const { assetType, fileBuffer, fileName, mimeType } = (req.body || {}) as {
            assetType?: UploadAssetType;
            fileBuffer?: string;
            fileName?: string;
            mimeType?: string;
        };

        if (!isValidAssetType(assetType)) {
            return sendError(res, 'Invalid assetType',
                `assetType must be one of: ${VALID_ASSET_TYPES.join(', ')}`, 400);
        }

        if (!fileBuffer || !fileName) {
            return sendError(res, 'Missing required fields',
                'fileBuffer and fileName are required', 400);
        }

        const userId = req.user?.id || 'anonymous';

        // Convert base64 buffer to Buffer
        const buffer = Buffer.from(fileBuffer, 'base64');

        // Upload to S3
        const uploadedFile = await s3Service.uploadBuffer(
            buffer,
            assetType,
            userId,
            fileName,
            mimeType || 'application/octet-stream'
        );

        // Return ONLY the S3 key, not the full URL
        // Database stores keys, URLs are generated on-demand via S3UrlGenerator
        return sendSuccess(res, {
            s3Key: uploadedFile.key, // Store this in database
            assetType,
            size: uploadedFile.size,
            mimeType: uploadedFile.mimeType,
            uploadedAt: new Date().toISOString()
        }, 'File uploaded successfully via backend');

    } catch (error: any) {
        return sendError(res, 'Backend upload failed', error?.message || 'Unknown error', 500);
    }
};

