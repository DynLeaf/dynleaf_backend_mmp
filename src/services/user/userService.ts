import * as userRepo from '../../repositories/userRepository.js';
import * as followRepo from '../../repositories/followRepository.js';
import { getS3Service } from '../../services/s3Service.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';

const AVATAR_UPLOAD_FOLDER = 'avatars';
const BASE64_IMAGE_PREFIX = 'data:image';
const HTTP_PREFIX = 'http://';
const HTTPS_PREFIX = 'https://';
const UPLOADS_PREFIX = '/uploads/';

const isBase64Image = (input: string): boolean => input.startsWith(BASE64_IMAGE_PREFIX);
const isValidUrl = (input: string): boolean =>
  input.startsWith(HTTP_PREFIX) || input.startsWith(HTTPS_PREFIX) || input.startsWith(UPLOADS_PREFIX);

export const processImageInput = async (input: string, userId: string): Promise<string> => {
  if (isBase64Image(input)) {
    try {
      const s3Service = getS3Service();
      const matches = input.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) throw new Error('Invalid base64 string');

      const mimeType = matches[1];
      const buffer = Buffer.from(matches[2], 'base64');

      const uploadedFile = await s3Service.uploadBuffer(
        buffer,
        'avatar',
        userId,
        `upload-${Date.now()}`,
        mimeType
      );
      return uploadedFile.key;
    } catch (error: any) {
      throw new AppError(`S3 upload failed: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }
  } else if (isValidUrl(input)) {
    return input;
  }
  throw new AppError('Invalid image format', 400, ErrorCode.VALIDATION_ERROR);
};

export const getUserProfile = async (userId: string) => {
  const user = await userRepo.findById(userId);
  if (!user) throw new AppError('User not found', 404, ErrorCode.USER_NOT_FOUND);

  const followingCount = await followRepo.countByUser(userId);
  const engageData = await userRepo.getSavedAndSharedItems(userId);
  const savedItems = engageData?.saved_items || [];
  const sharedItems = engageData?.shared_items || [];

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
    .sort((a, b) => new Date(b.action_at).getTime() - new Date(a.action_at).getTime())
    .slice(0, 20);

  return {
    ...user,
    following_count: followingCount,
    engagement_summary: {
      saved_total: savedItems.length,
      shared_total: sharedItems.length,
      saved_food_items: savedItems.filter((i: any) => i.entity_type === 'food_item').length,
      saved_combos: savedItems.filter((i: any) => i.entity_type === 'combo').length,
      saved_offers: savedItems.filter((i: any) => i.entity_type === 'offer').length,
      shared_food_items: sharedItems.filter((i: any) => i.entity_type === 'food_item').length,
      shared_combos: sharedItems.filter((i: any) => i.entity_type === 'combo').length,
      shared_offers: sharedItems.filter((i: any) => i.entity_type === 'offer').length,
      recent_activity: recentActivity,
    },
  };
};

export const updateProfile = async (
  userId: string,
  data: { full_name?: string; email?: string; phone?: string; bio?: string; avatar_url?: string }
) => {
  if (data.email) {
    const existing = await userRepo.findByEmail(data.email);
    if (existing && existing._id !== userId) {
      throw new AppError('Email is already in use by another account.', 400, ErrorCode.VALIDATION_ERROR);
    }
  }

  if (data.phone) {
    const existing = await userRepo.findByPhone(data.phone);
    if (existing && existing._id !== userId) {
      throw new AppError('Mobile number is already in use by another account.', 400, ErrorCode.VALIDATION_ERROR);
    }
  }

  const updateData: any = { ...data };
  
  if (data.avatar_url) {
    if (isBase64Image(data.avatar_url)) {
      updateData.avatar_url = await processImageInput(data.avatar_url, userId);
    } else if (!data.avatar_url.startsWith('avatars/') && !data.avatar_url.includes('/')) {
      throw new AppError('Invalid avatar format', 400, ErrorCode.VALIDATION_ERROR);
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new AppError('No valid fields to update', 400, ErrorCode.VALIDATION_ERROR);
  }

  const existingUser = await userRepo.findById(userId);
  const oldAvatarUrl = existingUser?.avatar_url;

  const updatedUser = await userRepo.updateProfile(userId, updateData);
  if (!updatedUser) throw new AppError('User not found', 404, ErrorCode.USER_NOT_FOUND);

  if (updateData.avatar_url && oldAvatarUrl && updateData.avatar_url !== oldAvatarUrl) {
    const s3 = getS3Service();
    await s3.safeDeleteFromUrl(oldAvatarUrl, updateData.avatar_url);
  }

  return updatedUser;
};

export const uploadAvatar = async (userId: string, imageInput: string) => {
  const avatarUrl = await processImageInput(imageInput, userId);

  const existingUser = await userRepo.findById(userId);
  const oldAvatarUrl = existingUser?.avatar_url;

  const updatedUser = await userRepo.updateProfile(userId, { avatar_url: avatarUrl });
  if (!updatedUser) throw new AppError('User not found', 404, ErrorCode.USER_NOT_FOUND);

  if (oldAvatarUrl && avatarUrl !== oldAvatarUrl) {
    const s3 = getS3Service();
    await s3.safeDeleteFromUrl(oldAvatarUrl, avatarUrl);
  }

  return { avatar_url: avatarUrl, user: updatedUser };
};
