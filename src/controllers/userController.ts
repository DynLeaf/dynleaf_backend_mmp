import { Response } from 'express';
import { AuthRequest } from '../types/express.js';
import * as userService from '../services/user/userService.js';
import * as engagementService from '../services/user/engagementService.js';
import { sendSuccess, sendError, sendAuthError } from '../utils/response.js';
import { AppError } from '../errors/AppError.js';
import { EngagementEntityType } from '../dto/user/engagement.dto.js';
import mongoose from 'mongoose';

const VALID_ENTITY_TYPES = new Set(['food_item', 'combo', 'offer']);

const handleError = (res: Response, error: unknown): Response => {
  if (error instanceof AppError) {
    if (error.statusCode === 401) return sendAuthError(res, error.errorCode, error.message);
    return sendError(res, error.message, error.errorCode, error.statusCode);
  }
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  return sendError(res, message, 'INTERNAL_ERROR', 500);
};

export const getUserProfile = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const profile = await userService.getUserProfile(req.user.id);
    return sendSuccess(res, profile, 'User profile retrieved successfully');
  } catch (error) {
    return handleError(res, error);
  }
};

export const updateUserProfile = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const { full_name, email, phone, bio } = req.body;
    let avatar_url = req.body.avatar_url || req.body.avatarUrl || req.body.imageUrl || req.body.url;
    
    // Allow empty string to pass validation as "not provided" but catch undefined
    if (avatar_url === undefined && ('avatar_url' in req.body)) {
       return sendError(res, 'Invalid avatar_url', 'avatar_url must be a string', 400);
    }

    const updatedUser = await userService.updateProfile(req.user.id, {
      full_name, email, phone, bio, avatar_url
    });
    return sendSuccess(res, updatedUser, 'Profile updated successfully');
  } catch (error) {
    return handleError(res, error);
  }
};

export const uploadAvatar = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const input = req.body.image || req.body.imageUrl || req.body.url;
    if (!input || typeof input !== 'string') {
      return sendError(res, 'Invalid image data', 'Please provide image (base64) or imageUrl (hosted URL)', 400);
    }
    const result = await userService.uploadAvatar(req.user.id, input);
    return sendSuccess(res, result, 'Avatar uploaded successfully');
  } catch (error) {
    return handleError(res, error);
  }
};

export const toggleSaveEngagementItem = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const { entity_type, entity_id, outlet_id } = req.body;
    
    if (!entity_type || !VALID_ENTITY_TYPES.has(entity_type)) {
      return sendError(res, 'Invalid interaction', 'entity_type is required', 400);
    }
    if (!entity_id || !mongoose.Types.ObjectId.isValid(entity_id)) {
      return sendError(res, 'Invalid interaction', 'Valid entity_id is required', 400);
    }

    const result = await engagementService.toggleSaveItem(
      req.user.id,
      entity_type as EngagementEntityType,
      entity_id,
      outlet_id
    );
    return sendSuccess(res, result, result.saved ? 'Item saved successfully' : 'Item removed from saved list');
  } catch (error) {
    return handleError(res, error);
  }
};

export const markSharedEngagementItem = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const { entity_type, entity_id, outlet_id } = req.body;

    if (!entity_type || !VALID_ENTITY_TYPES.has(entity_type)) {
      return sendError(res, 'Invalid interaction', 'entity_type is required', 400);
    }
    if (!entity_id || !mongoose.Types.ObjectId.isValid(entity_id)) {
      return sendError(res, 'Invalid interaction', 'Valid entity_id is required', 400);
    }

    const result = await engagementService.markSharedItem(
      req.user.id,
      entity_type as EngagementEntityType,
      entity_id,
      outlet_id
    );
    return sendSuccess(res, result, 'Share status recorded successfully');
  } catch (error) {
    return handleError(res, error);
  }
};

export const getEngagementItemStatus = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const entity_type = req.query.entity_type as string;
    const entity_id = req.query.entity_id as string;

    if (!entity_type || !VALID_ENTITY_TYPES.has(entity_type)) {
      return sendError(res, 'Invalid query', 'entity_type is required and must be valid', 400);
    }
    if (!entity_id || !mongoose.Types.ObjectId.isValid(entity_id)) {
      return sendError(res, 'Invalid query', 'entity_id is required and must be a valid ObjectId', 400);
    }

    const result = await engagementService.getEngagementStatus(
      req.user.id,
      entity_type as EngagementEntityType,
      entity_id
    );
    return sendSuccess(res, result, 'Engagement status fetched successfully');
  } catch (error) {
    return handleError(res, error);
  }
};

export const getEngagementSummary = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const profile = await userService.getUserProfile(req.user.id);
    return sendSuccess(res, profile.engagement_summary, 'Engagement summary fetched successfully');
  } catch (error) {
    return handleError(res, error);
  }
};

export const getSavedEngagementItems = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const page = Math.max(parseInt(String(req.query.page || 1), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || 10), 10) || 10, 1), 50);

    const result = await engagementService.getSavedItemsPaged(req.user.id, page, limit);
    return sendSuccess(res, result, 'Saved items fetched successfully');
  } catch (error) {
    return handleError(res, error);
  }
};
