/**
 * Middleware for handling push notification image uploads
 * Integrates with Cloudinary for image storage
 */

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { uploadNotificationImage } from '../utils/cloudinaryNotificationUtils.js';
import { sendError } from '../utils/response.js';

// Configure multer for in-memory storage (we'll upload to Cloudinary)
const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: Function) => {
  // Accept only image files
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed. Received: ${file.mimetype}`
      ),
      false
    );
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

/**
 * Middleware to process uploaded file and upload to Cloudinary
 */
export const processNotificationImageUpload = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.file) {
      return next();
    }

    const { originalname, buffer, mimetype } = req.file;

    // Validate file size
    if (buffer.length > 5 * 1024 * 1024) {
      return sendError(res, 'File size exceeds 5MB limit', 400);
    }

    // Upload to Cloudinary
    const uploadedImage = await uploadNotificationImage(buffer, originalname);

    // Attach upload result to request for use in controller
    (req as any).uploadedImage = uploadedImage;

    next();
  } catch (error: any) {
    console.error('Image upload processing error:', error);
    return sendError(res, error.message || 'Failed to upload image', 400);
  }
};

/**
 * Middleware to validate image URL
 */
export const validateImageUrlMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { image_url } = req.body;

    if (!image_url) {
      return next();
    }

    // Basic URL validation
    try {
      new URL(image_url);
    } catch {
      return sendError(res, 'Invalid image URL format', 400);
    }

    // Check if URL is accessible
    const isAccessible = await fetch(image_url, { method: 'HEAD' })
      .then(res => res.ok)
      .catch(() => false);

    if (!isAccessible) {
      console.warn(`Image URL is not accessible: ${image_url}`);
      // Don't fail here, just warn - the image might be accessible at send time
    }

    next();
  } catch (error: any) {
    console.error('Image URL validation error:', error);
    return sendError(res, 'Failed to validate image URL', 400);
  }
};

export default {
  uploadMiddleware,
  processNotificationImageUpload,
  validateImageUrlMiddleware,
};
