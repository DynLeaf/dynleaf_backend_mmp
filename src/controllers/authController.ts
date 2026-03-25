import { Request, Response } from 'express';
import { AuthRequest } from '../types/express.js';
import * as authService from '../services/auth/authService.js';
import * as authExtendedService from '../services/auth/authExtendedService.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { AppError } from '../errors/AppError.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const ACCESS_TOKEN_OPTIONS = { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 };
const PUBLIC_COOKIE_OPTIONS = { ...COOKIE_OPTIONS, httpOnly: false };

const setAuthCookies = (res: Response, accessToken: string, refreshToken: string): void => {
  res.cookie('accessToken', accessToken, ACCESS_TOKEN_OPTIONS);
  res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
  res.cookie('isLoggedIn', 'true', PUBLIC_COOKIE_OPTIONS);
};

const clearAuthCookies = (res: Response): void => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  res.clearCookie('isLoggedIn');
};

const getClientIp = (req: Request): string =>
  req.ip || req.socket.remoteAddress || 'unknown';

const handleError = (res: Response, error: unknown): Response => {
  if (error instanceof AppError) {
    return sendError(res, error.message, error.errorCode, error.statusCode);
  }
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  return sendError(res, message);
};

export const sendOtp = async (req: Request, res: Response): Promise<Response> => {
  try {
    const result = await authService.sendOtp(req.body.phone);
    return sendSuccess(res, { expiresIn: result.expiresIn }, 'OTP sent successfully');
  } catch (error) {
    return handleError(res, error);
  }
};

export const verifyOtp = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { phone, otp, deviceInfo } = req.body;
    const result = await authService.verifyOtp(phone, otp, deviceInfo, getClientIp(req));
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return sendSuccess(res, { user: result.user });
  } catch (error) {
    return handleError(res, error);
  }
};

export const refreshToken = async (req: Request, res: Response): Promise<Response> => {
  try {
    const result = await authService.refreshTokens(req.cookies.refreshToken);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return sendSuccess(res, null);
  } catch (error) {
    return handleError(res, error);
  }
};

export const logout = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendError(res, 'Not authenticated', null, 401);
    await authService.logout(req.user.id, req.user.sessionId, req.body.deviceId, req.body.allDevices);
    clearAuthCookies(res);
    return sendSuccess(res, null, 'Logged out successfully');
  } catch (error) {
    return handleError(res, error);
  }
};

export const getCurrentUser = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendError(res, 'Not authenticated', null, 401);
    const result = await authService.getCurrentUser(req.user.id, req.user.activeRole as Record<string, unknown> | null, req.user.permissions);
    return sendSuccess(res, result);
  } catch (error) {
    return handleError(res, error);
  }
};

export const switchRole = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendError(res, 'Not authenticated', null, 401);
    const { scope, role, brandId, outletId } = req.body;
    const result = await authService.switchRole(req.user.id, req.user.sessionId, scope, role, brandId, outletId);
    res.cookie('accessToken', result.accessToken, ACCESS_TOKEN_OPTIONS);
    return sendSuccess(res, { user: { id: result.userId, activeRole: result.activeRole } });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getSessions = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendError(res, 'Not authenticated', null, 401);
    const sessions = await authExtendedService.getSessions(req.user.id, req.user.sessionId);
    return sendSuccess(res, { sessions });
  } catch (error) {
    return handleError(res, error);
  }
};

export const deleteSession = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user) return sendError(res, 'Not authenticated', null, 401);
    await authExtendedService.deleteSession(req.params.sessionId, req.user.id);
    return sendSuccess(res, null, 'Session deleted successfully');
  } catch (error) {
    return handleError(res, error);
  }
};

export const adminLogin = async (req: Request, res: Response): Promise<Response> => {
  try {
    const result = await authExtendedService.adminLogin(
      req.body.email,
      req.body.password,
      getClientIp(req),
      req.headers['user-agent']
    );
    res.cookie('admin_token', result.token, COOKIE_OPTIONS);
    return sendSuccess(res, { user: result.user }, 'Login successful');
  } catch (error) {
    return handleError(res, error);
  }
};

export const adminLogout = async (_req: Request, res: Response): Promise<Response> => {
  try {
    res.clearCookie('admin_token');
    return sendSuccess(res, null, 'Logout successful');
  } catch (error) {
    return handleError(res, error);
  }
};

export const exchangeGoogleCode = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { code, redirect_uri, deviceInfo } = req.body;
    const result = await authExtendedService.exchangeGoogleCode(code, redirect_uri, deviceInfo, getClientIp(req));
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return sendSuccess(res, { user: result.user });
  } catch (error) {
    return handleError(res, error);
  }
};
