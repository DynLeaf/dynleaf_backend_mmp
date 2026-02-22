import { Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Follow } from '../models/Follow.js';
import { FoodItem } from '../models/FoodItem.js';
import { Combo } from '../models/Combo.js';
import { Offer } from '../models/Offer.js';
import { Outlet } from '../models/Outlet.js';
import { AuthRequest } from '../middleware/authMiddleware.js';
import { safeDeleteFromCloudinary } from '../services/cloudinaryService.js';
import { sendSuccess, sendError, sendAuthError, sendNotFoundError } from '../utils/response.js';
import { getS3Service } from '../services/s3Service.js';

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
const VALID_ENTITY_TYPES = new Set(['food_item', 'combo', 'offer']);

type EngagementEntityType = 'food_item' | 'combo' | 'offer';

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

const processImageInput = async (input: string, folder: UploadFolder, userId: string): Promise<string> => {
    if (isBase64Image(input)) {
        try {
            const s3Service = getS3Service();
            
            // Extract base64 data and mime type
            const matches = input.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                throw new Error('Invalid base64 string');
            }

            const mimeType = matches[1];
            const base64Content = matches[2];
            const buffer = Buffer.from(base64Content, 'base64');

            // Upload to S3 and return the key (not the URL)
            const uploadedFile = await s3Service.uploadBuffer(
                buffer,
                folder === 'avatars' ? 'avatar' : folder as any,
                userId,
                `upload-${Date.now()}`,
                mimeType
            );

            // Return S3 key, not URL
            return uploadedFile.key;
        } catch (error: any) {
            throw new Error(`S3 upload failed: ${error.message}`);
        }
    } else if (isValidUrl(input)) {
        return input;
    }
    throw new Error(ERROR_MESSAGES.INVALID_IMAGE_FORMAT);
};

const getUserWithFollowingCount = async (userId: string) => {
    const user = await User.findById(userId).select('-password_hash');
    if (!user) return null;

    const followingCount = await Follow.countDocuments({ user: userId });
    const savedItems = (user as any).saved_items || [];
    const sharedItems = (user as any).shared_items || [];

    const recentActivity = [
        ...savedItems.map((item: any) => ({
            entity_type: item.entity_type,
            entity_id: item.entity_id,
            outlet_id: item.outlet_id,
            action: 'saved',
            action_at: item.saved_at,
        })),
        ...sharedItems.map((item: any) => ({
            entity_type: item.entity_type,
            entity_id: item.entity_id,
            outlet_id: item.outlet_id,
            action: 'shared',
            action_at: item.shared_at,
        })),
    ]
        .sort((a: any, b: any) => new Date(b.action_at).getTime() - new Date(a.action_at).getTime())
        .slice(0, 20);

    return {
        ...user.toObject(),
        following_count: followingCount,
        engagement_summary: {
            saved_total: savedItems.length,
            shared_total: sharedItems.length,
            saved_food_items: savedItems.filter((item: any) => item.entity_type === 'food_item').length,
            saved_combos: savedItems.filter((item: any) => item.entity_type === 'combo').length,
            saved_offers: savedItems.filter((item: any) => item.entity_type === 'offer').length,
            shared_food_items: sharedItems.filter((item: any) => item.entity_type === 'food_item').length,
            shared_combos: sharedItems.filter((item: any) => item.entity_type === 'combo').length,
            shared_offers: sharedItems.filter((item: any) => item.entity_type === 'offer').length,
            recent_activity: recentActivity,
        }
    };
};

const validateEngagementPayload = (body: any) => {
    const entityType = body?.entity_type as EngagementEntityType | undefined;
    const entityId = body?.entity_id as string | undefined;
    const outletId = body?.outlet_id as string | undefined;

    if (!entityType || !VALID_ENTITY_TYPES.has(entityType)) {
        return { error: 'Invalid entity_type. Expected one of: food_item, combo, offer' };
    }

    if (!entityId || !mongoose.Types.ObjectId.isValid(entityId)) {
        return { error: 'Invalid entity_id' };
    }

    if (outletId && !mongoose.Types.ObjectId.isValid(outletId)) {
        return { error: 'Invalid outlet_id' };
    }

    return {
        entityType,
        entityId,
        outletId,
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
            // Handle different avatar input types:
            // 1. S3 key (e.g., "avatars/userId/file.webp") - store as-is
            // 2. Base64 image - upload and store key
            // 3. Full S3 URL - extract key and store
            
            if (isBase64Image(avatar_url)) {
                // Base64 image - upload to S3 and get key
                try {
                    updateData.avatar_url = await processImageInput(avatar_url, AVATAR_UPLOAD_FOLDER, userId);
                } catch (uploadError) {
                    console.error('Error uploading avatar:', uploadError);
                    return sendError(res, ERROR_MESSAGES.AVATAR_UPLOAD_FAILED, 'Image upload failed', 400);
                }
            } else if (avatar_url.startsWith('avatars/') || avatar_url.includes('/')) {
                // S3 key or URL - store directly (could be key like "avatars/123/file.webp")
                // or full URL which gets stored as-is for backward compatibility
                updateData.avatar_url = avatar_url;
            } else {
                return sendError(res, 'Invalid avatar format', 'Avatar must be base64, S3 key, or URL', 400);
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
            avatarUrl = await processImageInput(input, AVATAR_UPLOAD_FOLDER, userId);
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

export const toggleSaveEngagementItem = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return sendAuthError(res, 'INVALID_CREDENTIALS', ERROR_MESSAGES.UNAUTHORIZED);
        }

        const validation = validateEngagementPayload(req.body);
        if ('error' in validation) {
            return sendError(res, 'Invalid engagement payload', validation.error, 400);
        }

        const { entityType, entityId, outletId } = validation;
        const user = await User.findById(userId);
        if (!user) {
            return sendNotFoundError(res, 'USER_NOT_FOUND', ERROR_MESSAGES.USER_NOT_FOUND);
        }

        const currentSaved = (user as any).saved_items || [];
        const existingIndex = currentSaved.findIndex(
            (item: any) => item.entity_type === entityType && String(item.entity_id) === String(entityId)
        );

        let saved = false;
        if (existingIndex >= 0) {
            currentSaved.splice(existingIndex, 1);
            saved = false;
        } else {
            currentSaved.push({
                entity_type: entityType,
                entity_id: new mongoose.Types.ObjectId(entityId),
                outlet_id: outletId ? new mongoose.Types.ObjectId(outletId) : undefined,
                saved_at: new Date(),
            });
            saved = true;
        }

        (user as any).saved_items = currentSaved;
        await user.save();

        return sendSuccess(res, {
            entity_type: entityType,
            entity_id: entityId,
            saved,
            saved_items_count: currentSaved.length,
        }, saved ? 'Item saved successfully' : 'Item removed from saved list');
    } catch (error: any) {
        console.error('Error toggling save item:', error);
        return sendError(res, 'Failed to toggle save item', error.message, 500);
    }
};

export const markSharedEngagementItem = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return sendAuthError(res, 'INVALID_CREDENTIALS', ERROR_MESSAGES.UNAUTHORIZED);
        }

        const validation = validateEngagementPayload(req.body);
        if ('error' in validation) {
            return sendError(res, 'Invalid engagement payload', validation.error, 400);
        }

        const { entityType, entityId, outletId } = validation;
        const user = await User.findById(userId);
        if (!user) {
            return sendNotFoundError(res, 'USER_NOT_FOUND', ERROR_MESSAGES.USER_NOT_FOUND);
        }

        const currentShared = (user as any).shared_items || [];
        const existingIndex = currentShared.findIndex(
            (item: any) => item.entity_type === entityType && String(item.entity_id) === String(entityId)
        );

        if (existingIndex >= 0) {
            currentShared[existingIndex].shared_at = new Date();
            if (outletId) {
                currentShared[existingIndex].outlet_id = new mongoose.Types.ObjectId(outletId);
            }
        } else {
            currentShared.push({
                entity_type: entityType,
                entity_id: new mongoose.Types.ObjectId(entityId),
                outlet_id: outletId ? new mongoose.Types.ObjectId(outletId) : undefined,
                shared_at: new Date(),
            });
        }

        (user as any).shared_items = currentShared;
        await user.save();

        return sendSuccess(res, {
            entity_type: entityType,
            entity_id: entityId,
            shared: true,
            last_shared_at: new Date(),
            shared_items_count: currentShared.length,
        }, 'Share status recorded successfully');
    } catch (error: any) {
        console.error('Error marking shared item:', error);
        return sendError(res, 'Failed to mark share status', error.message, 500);
    }
};

export const getEngagementItemStatus = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return sendAuthError(res, 'INVALID_CREDENTIALS', ERROR_MESSAGES.UNAUTHORIZED);
        }

        const entityType = req.query?.entity_type as EngagementEntityType | undefined;
        const entityId = req.query?.entity_id as string | undefined;

        if (!entityType || !VALID_ENTITY_TYPES.has(entityType)) {
            return sendError(res, 'Invalid query', 'entity_type is required and must be one of: food_item, combo, offer', 400);
        }

        if (!entityId || !mongoose.Types.ObjectId.isValid(entityId)) {
            return sendError(res, 'Invalid query', 'entity_id is required and must be a valid ObjectId', 400);
        }

        const user = await User.findById(userId).select('saved_items shared_items');
        if (!user) {
            return sendNotFoundError(res, 'USER_NOT_FOUND', ERROR_MESSAGES.USER_NOT_FOUND);
        }

        const savedItem = ((user as any).saved_items || []).find(
            (item: any) => item.entity_type === entityType && String(item.entity_id) === String(entityId)
        );
        const sharedItem = ((user as any).shared_items || []).find(
            (item: any) => item.entity_type === entityType && String(item.entity_id) === String(entityId)
        );

        return sendSuccess(res, {
            entity_type: entityType,
            entity_id: entityId,
            is_saved: !!savedItem,
            is_shared: !!sharedItem,
            saved_at: savedItem?.saved_at || null,
            last_shared_at: sharedItem?.shared_at || null,
        }, 'Engagement status fetched successfully');
    } catch (error: any) {
        console.error('Error fetching engagement status:', error);
        return sendError(res, 'Failed to fetch engagement status', error.message, 500);
    }
};

export const getEngagementSummary = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return sendAuthError(res, 'INVALID_CREDENTIALS', ERROR_MESSAGES.UNAUTHORIZED);
        }

        const userData = await getUserWithFollowingCount(userId);
        if (!userData) {
            return sendNotFoundError(res, 'USER_NOT_FOUND', ERROR_MESSAGES.USER_NOT_FOUND);
        }

        return sendSuccess(res, userData.engagement_summary, 'Engagement summary fetched successfully');
    } catch (error: any) {
        console.error('Error fetching engagement summary:', error);
        return sendError(res, 'Failed to fetch engagement summary', error.message, 500);
    }
};

export const getSavedEngagementItems = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return sendAuthError(res, 'INVALID_CREDENTIALS', ERROR_MESSAGES.UNAUTHORIZED);
        }

        const page = Math.max(parseInt(String(req.query.page || 1), 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(String(req.query.limit || 10), 10) || 10, 1), 50);

        const user = await User.findById(userId).select('saved_items');
        if (!user) {
            return sendNotFoundError(res, 'USER_NOT_FOUND', ERROR_MESSAGES.USER_NOT_FOUND);
        }

        const savedItems = [ ...((user as any).saved_items || []) ].sort((a: any, b: any) => {
            return new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime();
        });

        const total = savedItems.length;
        const start = (page - 1) * limit;
        const pagedItems = savedItems.slice(start, start + limit);

        const foodItemIds = pagedItems
            .filter((item: any) => item.entity_type === 'food_item')
            .map((item: any) => item.entity_id)
            .filter(Boolean);
        const comboIds = pagedItems
            .filter((item: any) => item.entity_type === 'combo')
            .map((item: any) => item.entity_id)
            .filter(Boolean);
        const offerIds = pagedItems
            .filter((item: any) => item.entity_type === 'offer')
            .map((item: any) => item.entity_id)
            .filter(Boolean);

        const [foodItems, combos, offers] = await Promise.all([
            foodItemIds.length > 0
                ? FoodItem.find({ _id: { $in: foodItemIds } }).select('name slug image_url outlet_id').lean()
                : Promise.resolve([] as any[]),
            comboIds.length > 0
                ? Combo.find({ _id: { $in: comboIds } }).select('name image_url outlet_id').lean()
                : Promise.resolve([] as any[]),
            offerIds.length > 0
                ? Offer.find({ _id: { $in: offerIds } }).select('title banner_image_url outlet_ids').lean()
                : Promise.resolve([] as any[]),
        ]);

        const foodMap = new Map(foodItems.map((item: any) => [String(item._id), item]));
        const comboMap = new Map(combos.map((item: any) => [String(item._id), item]));
        const offerMap = new Map(offers.map((item: any) => [String(item._id), item]));

        const outletIds = new Set<string>();
        for (const item of pagedItems) {
            if (item.outlet_id) {
                outletIds.add(String(item.outlet_id));
            }
            if (item.entity_type === 'food_item') {
                const food = foodMap.get(String(item.entity_id));
                if (food?.outlet_id) {
                    outletIds.add(String(food.outlet_id));
                }
            }
            if (item.entity_type === 'combo') {
                const combo = comboMap.get(String(item.entity_id));
                if (combo?.outlet_id) {
                    outletIds.add(String(combo.outlet_id));
                }
            }
            if (item.entity_type === 'offer') {
                const offer = offerMap.get(String(item.entity_id));
                const firstOutletId = offer?.outlet_ids?.[0];
                if (firstOutletId) {
                    outletIds.add(String(firstOutletId));
                }
            }
        }

        const outlets = outletIds.size > 0
            ? await Outlet.find({ _id: { $in: Array.from(outletIds) } }).select('name slug').lean()
            : [];
        const outletMap = new Map(outlets.map((outlet: any) => [String(outlet._id), outlet]));

        const items = pagedItems.map((item: any) => {
            const entityId = String(item.entity_id);

            if (item.entity_type === 'food_item') {
                const food = foodMap.get(entityId);
                const outletId = String(item.outlet_id || food?.outlet_id || '');
                const outlet = outletMap.get(outletId);
                return {
                    entity_type: 'food_item',
                    entity_id: entityId,
                    outlet_id: outletId || null,
                    saved_at: item.saved_at,
                    title: food?.name || 'Food item',
                    image_url: food?.image_url || null,
                    outlet_name: outlet?.name || null,
                    outlet_slug: outlet?.slug || null,
                    dish_slug: food?.slug || null,
                };
            }

            if (item.entity_type === 'combo') {
                const combo = comboMap.get(entityId);
                const outletId = String(item.outlet_id || combo?.outlet_id || '');
                const outlet = outletMap.get(outletId);
                return {
                    entity_type: 'combo',
                    entity_id: entityId,
                    outlet_id: outletId || null,
                    saved_at: item.saved_at,
                    title: combo?.name || 'Combo',
                    image_url: combo?.image_url || null,
                    outlet_name: outlet?.name || null,
                    outlet_slug: outlet?.slug || null,
                };
            }

            const offer = offerMap.get(entityId);
            const outletId = String(item.outlet_id || offer?.outlet_ids?.[0] || '');
            const outlet = outletMap.get(outletId);
            return {
                entity_type: 'offer',
                entity_id: entityId,
                outlet_id: outletId || null,
                saved_at: item.saved_at,
                title: offer?.title || 'Offer',
                image_url: offer?.banner_image_url || null,
                outlet_name: outlet?.name || null,
                outlet_slug: outlet?.slug || null,
            };
        });

        return sendSuccess(res, {
            items,
            pagination: {
                page,
                limit,
                total,
                hasMore: start + limit < total,
            },
        }, 'Saved items fetched successfully');
    } catch (error: any) {
        console.error('Error fetching saved engagement items:', error);
        return sendError(res, 'Failed to fetch saved items', error.message, 500);
    }
};
