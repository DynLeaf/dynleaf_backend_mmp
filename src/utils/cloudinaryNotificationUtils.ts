/**
 * Cloudinary utility functions for push notifications
 * Handles image uploads and management for notifications
 */

import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

// Configure Cloudinary if not already configured
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export interface UploadedImage {
  url: string;
  public_id: string;
  size: number;
  width?: number;
  height?: number;
  format: string;
}

/**
 * Upload notification image to Cloudinary
 * Supports both file path and buffer
 */
export const uploadNotificationImage = async (
  fileBuffer: Buffer | string,
  fileName: string
): Promise<UploadedImage> => {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      throw new Error('Cloudinary is not configured');
    }

    const publicId = `notifications/${Date.now()}_${fileName.replace(/\s+/g, '_')}`;

    const uploadOptions = {
      public_id: publicId,
      folder: 'notifications',
      resource_type: 'auto' as const,
      transformation: [
        {
          width: 1200,
          height: 630,
          crop: 'limit' as const,
          quality: 'auto:good' as const,
          fetch_format: 'auto' as const,
        },
      ],
    };

    let result;

    if (typeof fileBuffer === 'string') {
      // If it's a URL, use the URL upload
      result = await cloudinary.uploader.upload(fileBuffer, uploadOptions);
    } else {
      // If it's a buffer, use streaming upload
      result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });

        if (fileBuffer instanceof Buffer) {
          stream.end(fileBuffer);
        } else if (fileBuffer instanceof Readable) {
          fileBuffer.pipe(stream);
        }
      });
    }

    const uploadResult = result as any;

    return {
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      size: uploadResult.bytes,
      width: uploadResult.width,
      height: uploadResult.height,
      format: uploadResult.format,
    };
  } catch (error: any) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
};

/**
 * Delete notification image from Cloudinary
 */
export const deleteNotificationImage = async (publicId: string): Promise<boolean> => {
  try {
    if (!publicId) {
      console.warn('No public_id provided for deletion');
      return false;
    }

    const result = (await cloudinary.uploader.destroy(publicId)) as any;

    if (result.result === 'ok') {
      return true;
    } else if (result.result === 'not found') {
      console.warn(`Image not found on Cloudinary: ${publicId}`);
      return false;
    } else {
      console.error(`Unexpected Cloudinary response: ${result.result}`);
      return false;
    }
  } catch (error: any) {
    console.error('Cloudinary deletion error:', error);
    throw new Error(`Failed to delete image: ${error.message}`);
  }
};

/**
 * Get image metadata from Cloudinary
 */
export const getImageMetadata = async (publicId: string) => {
  try {
    const result = (await cloudinary.api.resource(publicId)) as any;

    return {
      url: result.secure_url,
      public_id: result.public_id,
      size: result.bytes,
      width: result.width,
      height: result.height,
      format: result.format,
      created_at: result.created_at,
    };
  } catch (error: any) {
    console.error('Failed to get image metadata:', error);
    throw error;
  }
};

/**
 * Batch delete notification images
 */
export const batchDeleteNotificationImages = async (publicIds: string[]): Promise<number> => {
  try {
    if (!publicIds || publicIds.length === 0) {
      return 0;
    }

    let deleted = 0;

    // Cloudinary batch delete is not directly available, so we delete one by one
    // For better performance, consider using a queue system for large batches
    for (const publicId of publicIds) {
      try {
        const result = (await cloudinary.uploader.destroy(publicId)) as any;
        if (result.result === 'ok') {
          deleted++;
        }
      } catch (error) {
        console.error(`Failed to delete image ${publicId}:`, error);
        // Continue with next image even if one fails
      }
    }

    return deleted;
  } catch (error: any) {
    console.error('Batch delete error:', error);
    throw error;
  }
};

/**
 * Generate optimized Cloudinary URL for different use cases
 */
export const generateOptimizedImageUrl = (
  publicId: string,
  options: {
    width?: number;
    height?: number;
    quality?: 'auto' | 'good' | 'best';
    format?: 'auto' | 'webp' | 'jpg' | 'png';
  } = {}
): string => {
  const { width = 1200, height = 630, quality = 'auto', format = 'auto' } = options;

  return cloudinary.url(publicId, {
    width,
    height,
    crop: 'limit',
    quality,
    fetch_format: format,
    secure: true,
  });
};

/**
 * Validate image URL (check if it's accessible)
 */
export const validateImageUrl = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.status === 200;
  } catch (error) {
    console.error('Image validation error:', error);
    return false;
  }
};

export default {
  uploadNotificationImage,
  deleteNotificationImage,
  getImageMetadata,
  batchDeleteNotificationImages,
  generateOptimizedImageUrl,
  validateImageUrl,
};
