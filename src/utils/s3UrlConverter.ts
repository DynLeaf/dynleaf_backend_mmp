import { getS3Service } from '../services/s3Service.js';

/**
 * Convert Cloudinary URL to S3 URL
 * This utility helps migrate URLs from Cloudinary to S3
 */
export const convertCloudinaryUrlToS3 = (cloudinaryUrl: string, assetType: string): string => {
    // If already S3 URL, return as-is
    if (cloudinaryUrl?.includes('amazonaws.com')) {
        return cloudinaryUrl;
    }

    // Extract the public ID from Cloudinary URL
    if (!cloudinaryUrl?.includes('cloudinary.com')) {
        return cloudinaryUrl;
    }

    try {
        const regex = /cloudinary\.com\/[^\/]+\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/;
        const match = cloudinaryUrl.match(regex);

        if (!match) return cloudinaryUrl;

        const publicId = match[2]; // e.g., "menu/user123/abc-def"
        const s3Service = getS3Service();
        const s3Key = `${publicId}.webp`;
        
        return s3Service.getFileUrl(s3Key);
    } catch (error) {
        console.warn('Failed to convert Cloudinary URL:', error);
        return cloudinaryUrl;
    }
};

/**
 * Check if URL is from Cloudinary
 */
export const isCloudinaryUrl = (url: string): boolean => {
    return url?.includes('cloudinary.com') || false;
};

/**
 * Check if URL is from S3
 */
export const isS3Url = (url: string): boolean => {
    return url?.includes('amazonaws.com') || false;
};

/**
 * Extract asset type from S3 key
 */
export const extractAssetTypeFromS3Key = (s3Key: string): string | null => {
    const parts = s3Key.split('/');
    if (parts.length < 2) return null;
    return parts[0]; // e.g., "menu", "brands", "gallery"
};

/**
 * Extract user ID from S3 key
 */
export const extractUserIdFromS3Key = (s3Key: string): string | null => {
    const parts = s3Key.split('/');
    if (parts.length < 3) return null;
    return parts[1]; // e.g., user UUID
};

/**
 * Batch convert Cloudinary URLs to S3 URLs
 */
export const batchConvertCloudinaryToS3 = (urls: (string | null | undefined)[]): (string | null | undefined)[] => {
    return urls.map(url => {
        if (!url) return url;
        try {
            return convertCloudinaryUrlToS3(url, 'unknown');
        } catch (error) {
            console.warn('Batch conversion failed for URL:', url);
            return url;
        }
    });
};

/**
 * Validate S3 URL format
 */
export const isValidS3Url = (url: string): boolean => {
    try {
        const s3UrlPattern = /^https?:\/\/[a-z0-9-]+\.s3[.-].+\.amazonaws\.com\/[^?]+$/i;
        return s3UrlPattern.test(url);
    } catch (error) {
        return false;
    }
};

export default {
    convertCloudinaryUrlToS3,
    isCloudinaryUrl,
    isS3Url,
    extractAssetTypeFromS3Key,
    extractUserIdFromS3Key,
    batchConvertCloudinaryToS3,
    isValidS3Url
};
