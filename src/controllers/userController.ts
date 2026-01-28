import { Response } from 'express';
import { User } from '../models/User.js';
import { Follow } from '../models/Follow.js';
import { saveBase64Image } from '../utils/fileUpload.js';
import { AuthRequest } from '../middleware/authMiddleware.js';
import { safeDeleteFromCloudinary } from '../services/cloudinaryService.js';
import { sendSuccess, sendError, sendAuthError, sendNotFoundError } from '../utils/response.js';

// Constants
type UploadFolder = 'brands' | 'outlets' | 'avatars' | 'gallery' | 'gallery/interior' | 'gallery/exterior' | 'gallery/food' | 'menu' | 'temp' | 'stories';

const AVATAR_UPLOAD_FOLDER: UploadFolder = 'avatars';
const OUTLET_UPLOAD_FOLDER: UploadFolder = 'outlets';
const BASE64_IMAGE_PREFIX = 'data:image';
const HTTP_PREFIX = 'http://';
const HTTPS_PREFIX = 'https://';
const UPLOADS_PREFIX = '/uploads/';
const ERROR_MESSAGES = {
    UNAUTHORIZED: 'User not authenticated',
    USER_NOT_FOUND: 'User not found',
    PROFILE_FETCH_FAILED: 'Failed to fetch user profile',
    PROFILE_UPDATE_FAILED: 'Failed to update profile',
    AVATAR_UPLOAD_FAILED: 'Failed to upload avatar image',
    INVALID_AVATAR: 'Invalid avatar_url',
    AVATAR_STRING_REQUIRED: 'avatar_url must be a string',
    NO_FIELDS_TO_UPDATE: 'Please provide at least one field to update',
    INVALID_IMAGE_DATA: 'Please provide image (base64) or imageUrl (hosted URL)',
    INVALID_IMAGE_FORMAT: 'Please provide a valid base64 image or a hosted URL',
} as const;
const SUCCESS_MESSAGES = {
    PROFILE_RETRIEVED: 'User profile retrieved successfully',
    PROFILE_UPDATED: 'Profile updated successfully',
    AVATAR_UPLOADED: 'Avatar uploaded successfully',
} as const;

// Helper Functions
const extractAvatarUrl = (body: any): unknown => {
    return body?.avatar_url ?? body?.avatarUrl ?? body?.imageUrl ?? body?.url;
};

const extractImageInput = (body: any): string | undefined => {
    const { image, imageUrl, url } = body;
    return imageUrl || url || image;
};

const isBase64Image = (input: string): boolean => {
    return input.startsWith(BASE64_IMAGE_PREFIX);
};

const isValidUrl = (input: string): boolean => {
    return input.startsWith(HTTP_PREFIX) || input.startsWith(HTTPS_PREFIX) || input.startsWith(UPLOADS_PREFIX);
};

const processImageInput = async (input: string, folder: UploadFolder): Promise<string> => {
    if (isBase64Image(input)) {
        const uploadResult = await saveBase64Image(input, folder);
        return uploadResult.url;
    } else if (isValidUrl(input)) {
        return input;
    }
    throw new Error(ERROR_MESSAGES.INVALID_IMAGE_FORMAT);
};

const getUserWithFollowingCount = async (userId: string) => {
    const user = await User.findById(userId).select('-password_hash');
    if (!user) return null;

    const followingCount = await Follow.countDocuments({ user: userId });
    return {
        ...user.toObject(),
        following_count: followingCount
    };
};

export const getUserProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return sendAuthError(res, 'INVALID_CREDENTIALS', ERROR_MESSAGES.UNAUTHORIZED);
        }

        const userData = await getUserWithFollowingCount(userId);

        if (!userData) {
            return sendNotFoundError(res, 'USER_NOT_FOUND', ERROR_MESSAGES.USER_NOT_FOUND);
        }

        return sendSuccess(res, userData, SUCCESS_MESSAGES.PROFILE_RETRIEVED);
    } catch (error: any) {
        console.error('Error fetching user profile:', error);
        return sendError(res, ERROR_MESSAGES.PROFILE_FETCH_FAILED, error.message, 500);
    }
};

export const updateUserProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return sendAuthError(res, 'INVALID_CREDENTIALS', ERROR_MESSAGES.UNAUTHORIZED);
        }

        const { full_name, email, bio } = req.body;
        const avatar_url = extractAvatarUrl(req.body);

        const updateData: any = {};

        if (full_name !== undefined) updateData.full_name = full_name;
        if (email !== undefined) updateData.email = email;
        if (bio !== undefined) updateData.bio = bio;
        if (typeof avatar_url === 'string') {
            if (isBase64Image(avatar_url)) {
                try {
                    const uploadResult = await saveBase64Image(avatar_url, AVATAR_UPLOAD_FOLDER);
                    updateData.avatar_url = uploadResult.url;
                } catch (uploadError) {
                    console.error('Error uploading avatar:', uploadError);
                    return sendError(res, ERROR_MESSAGES.AVATAR_UPLOAD_FAILED, 'Image upload failed', 400);
                }
            } else {
                updateData.avatar_url = avatar_url;
            }
        } else if (avatar_url !== undefined) {
            return sendError(res, ERROR_MESSAGES.INVALID_AVATAR, ERROR_MESSAGES.AVATAR_STRING_REQUIRED, 400);
        }

        if (Object.keys(updateData).length === 0) {
            return sendError(res, 'No valid fields to update', ERROR_MESSAGES.NO_FIELDS_TO_UPDATE, 400);
        }

        // Get existing user to check for old avatar
        const existingUser = await User.findById(userId).select('avatar_url');
        const oldAvatarUrl = existingUser?.avatar_url;

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updateData },
            { new: true, runValidators: true }
        ).select('-password_hash');

        if (!updatedUser) {
            return sendNotFoundError(res, 'USER_NOT_FOUND', ERROR_MESSAGES.USER_NOT_FOUND);
        }

        // Delete old avatar from Cloudinary if avatar was updated
        if (updateData.avatar_url && oldAvatarUrl) {
            await safeDeleteFromCloudinary(oldAvatarUrl, updateData.avatar_url);
        }

        return sendSuccess(res, updatedUser, SUCCESS_MESSAGES.PROFILE_UPDATED);
    } catch (error: any) {
        console.error('Error updating user profile:', error);
        return sendError(res, ERROR_MESSAGES.PROFILE_UPDATE_FAILED, error.message, 500);
    }
};

export const uploadAvatar = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return sendAuthError(res, 'INVALID_CREDENTIALS', ERROR_MESSAGES.UNAUTHORIZED);
        }

        const input = extractImageInput(req.body);

        if (!input || typeof input !== 'string') {
            return sendError(res, 'Invalid image data', ERROR_MESSAGES.INVALID_IMAGE_DATA, 400);
        }

        let avatarUrl: string;
        try {
            avatarUrl = await processImageInput(input, AVATAR_UPLOAD_FOLDER);
        } catch (error) {
            return sendError(res, 'Invalid image data', ERROR_MESSAGES.INVALID_IMAGE_FORMAT, 400);
        }

        // Get existing user to check for old avatar
        const existingUser = await User.findById(userId).select('avatar_url');
        const oldAvatarUrl = existingUser?.avatar_url;

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: { avatar_url: avatarUrl } },
            { new: true }
        ).select('-password_hash');

        // Delete old avatar from Cloudinary if it was updated
        if (oldAvatarUrl) {
            await safeDeleteFromCloudinary(oldAvatarUrl, avatarUrl);
        }

        return sendSuccess(res, {
            avatar_url: avatarUrl,
            user: updatedUser
        }, SUCCESS_MESSAGES.AVATAR_UPLOADED);
    } catch (error: any) {
        console.error('Error uploading avatar:', error);
        return sendError(res, ERROR_MESSAGES.AVATAR_UPLOAD_FAILED, error.message, 500);
    }
};
