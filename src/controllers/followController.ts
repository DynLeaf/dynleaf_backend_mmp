import { Response } from 'express';
import { AuthRequest } from '../types/express.js';
import * as followService from '../services/follow/followService.js';
import { sendSuccess, sendError, sendAuthError } from '../utils/response.js';
import { AppError } from '../errors/AppError.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

const handleError = (res: Response, error: unknown): Response => {
  if (error instanceof AppError) {
    if (error.statusCode === 401) return sendAuthError(res, error.errorCode, error.message);
    return sendError(res, error.message, error.errorCode, error.statusCode);
  }
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  return sendError(res, message, 'INTERNAL_ERROR', 500);
};

export const followOutlet = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const { outletId } = req.params;
    
    if (!outletId) return sendError(res, 'Outlet ID is required', 'VALIDATION_ERROR', 400);

    const result = await followService.followOutlet(req.user.id, outletId);
    return sendSuccess(res, result, result.message);
  } catch (error) {
    return handleError(res, error);
  }
};

export const unfollowOutlet = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const { outletId } = req.params;
    
    if (!outletId) return sendError(res, 'Outlet ID is required', 'VALIDATION_ERROR', 400);

    const result = await followService.unfollowOutlet(req.user.id, outletId);
    return sendSuccess(res, result, result.message);
  } catch (error) {
    return handleError(res, error);
  }
};

export const getFollowedOutlets = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    
    const page = parseInt(req.query.page as string) || DEFAULT_PAGE;
    const limit = parseInt(req.query.limit as string) || DEFAULT_LIMIT;

    const result = await followService.getFollowedOutlets(req.user.id, page, limit);
    return sendSuccess(res, result);
  } catch (error) {
    return handleError(res, error);
  }
};

export const getOutletFollowersCount = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const { outletId } = req.params;
    if (!outletId) return sendError(res, 'Outlet ID is required', 'VALIDATION_ERROR', 400);

    const result = await followService.getOutletFollowersCount(outletId);
    return sendSuccess(res, result);
  } catch (error) {
    return handleError(res, error);
  }
};

export const checkFollowStatus = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const { outletId } = req.params;
    
    if (!outletId) return sendError(res, 'Outlet ID is required', 'VALIDATION_ERROR', 400);

    const result = await followService.checkFollowStatus(req.user.id, outletId);
    return sendSuccess(res, result);
  } catch (error) {
    return handleError(res, error);
  }
};
