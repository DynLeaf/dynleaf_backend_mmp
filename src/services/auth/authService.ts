import * as otpService from '../otpService.js';
import * as tokenService from '../tokenService.js';
import * as sessionService from '../sessionService.js';
import * as outletService from '../outletService.js';
import * as userRepo from '../../repositories/userRepository.js';
import * as adminRepo from '../../repositories/adminRepository.js';
import * as brandRepo from '../../repositories/brandRepository.js';
import * as followRepo from '../../repositories/followRepository.js';
import * as sessionRepo from '../../repositories/sessionRepository.js';
import { createAdminNotification } from '../adminNotificationService.js';
import { AppError, AuthenticationError, AuthorizationError, RateLimitError, ErrorCode } from '../../errors/AppError.js';
import {
  mapUserToAuthResponse,
  checkAccountLock,
  buildEngagementSummary,
  mapBrandToDto,
  mapOutletToDto,
} from './authMapper.js';
import { AuthUserResponseDto, AdminUserDto } from '../../dto/auth/index.js';
import jwt from 'jsonwebtoken';
import axios from 'axios';

const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;
const ACCOUNT_LOCK_DURATION = 30 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const MAX_COOKIE_BYTES = Number(process.env.MAX_ACCESS_TOKEN_COOKIE_BYTES || 3800);

export const validatePhoneNumber = (phone: string): boolean => PHONE_REGEX.test(phone);

export const validateAccessTokenSize = (accessToken: string): void => {
  const size = Buffer.byteLength(accessToken, 'utf8');
  if (size > MAX_COOKIE_BYTES) {
    throw new AppError(
      'Authentication cookie exceeded safe size. Please contact support.',
      500,
      ErrorCode.ACCESS_TOKEN_TOO_LARGE
    );
  }
};

// ─── OTP ────────────────────────────────────────────
export interface SendOtpResult { expiresIn: number }

export const sendOtp = async (phone: string): Promise<SendOtpResult> => {
  if (!phone) throw new AppError('Phone number is required', 400, ErrorCode.VALIDATION_ERROR);
  if (!validatePhoneNumber(phone)) throw new AppError('Invalid phone number format', 400, ErrorCode.VALIDATION_ERROR);

  const rateLimit = await otpService.checkRateLimit(phone);
  if (!rateLimit.allowed) {
    throw new RateLimitError('Too many OTP requests', rateLimit.retryAfter);
  }

  const result = await otpService.sendOTP(phone);
  return { expiresIn: result.expiresIn };
};

// ─── Verify OTP ─────────────────────────────────────
export interface DeviceInfo {
  deviceId: string;
  deviceName?: string;
  deviceType?: string;
  os?: string;
  browser?: string;
}

export interface VerifyOtpResult {
  user: AuthUserResponseDto;
  accessToken: string;
  refreshToken: string;
}

export const verifyOtp = async (
  phone: string,
  otp: string,
  deviceInfo: DeviceInfo,
  ip: string
): Promise<VerifyOtpResult> => {
  if (!phone || !otp) throw new AppError('Phone and OTP are required', 400, ErrorCode.VALIDATION_ERROR);
  if (!deviceInfo?.deviceId) throw new AppError('Device information is required', 400, ErrorCode.VALIDATION_ERROR);

  const isValid = await otpService.verifyOTP(phone, otp);
  if (!isValid) throw new AuthenticationError('Invalid OTP');

  let userPlain = await userRepo.findByPhone(phone);
  if (!userPlain) {
    userPlain = await userRepo.create({
      phone,
      roles: [{ scope: 'platform', role: 'customer', assignedAt: new Date() }],
      is_verified: true,
      is_active: true,
      currentStep: 'BRAND',
    });
    createAdminNotification({
      title: 'New User Joined',
      message: `A new user has registered with phone ${phone}.`,
      type: 'user',
      referenceId: userPlain._id,
    });
  }

  assertUserCanLogin(userPlain);

  const { accessToken, refreshToken } = await createAuthSession(userPlain, deviceInfo, ip);
  await userRepo.updateLoginMetadata(userPlain._id, ip, deviceInfo.deviceName || undefined);

  const brands = await brandRepo.findByAdminUserId(userPlain._id);
  const outlets = await outletService.getUserOutletsList(userPlain._id);
  await ensureRestaurantOwnerRole(userPlain, outlets);

  // Re-fetch user after potential role update
  const freshUser = await userRepo.findById(userPlain._id);
  if (!freshUser) throw new AppError('User not found after update', 500, ErrorCode.INTERNAL_SERVER_ERROR);

  return {
    user: mapUserToAuthResponse(freshUser, brands, outlets),
    accessToken,
    refreshToken,
  };
};

// ─── Refresh Token ──────────────────────────────────
export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

export const refreshTokens = async (currentRefreshToken: string): Promise<RefreshResult> => {
  if (!currentRefreshToken) throw new AuthenticationError('Refresh token is required');

  const decoded = tokenService.verifyRefreshToken(currentRefreshToken);
  const isValidSession = await sessionService.validateSession(decoded.sessionId);
  if (!isValidSession) throw new AuthenticationError('Invalid or expired session');

  const isValidToken = await sessionService.verifyRefreshToken(decoded.sessionId, currentRefreshToken);
  if (!isValidToken) throw new AuthenticationError('Invalid refresh token');

  const user = await userRepo.findById(decoded.id);
  if (!user || !user.is_active || user.is_suspended) {
    throw new AuthenticationError('User not found or inactive');
  }

  const newAccessToken = tokenService.generateAccessToken(
    { _id: user._id, roles: user.roles } as any as Parameters<typeof tokenService.generateAccessToken>[0],
    decoded.sessionId,
    undefined
  );
  const newRefreshToken = tokenService.generateRefreshToken(user._id, decoded.sessionId, decoded.tokenVersion + 1);

  await sessionService.rotateRefreshToken(decoded.sessionId, newRefreshToken);

  validateAccessTokenSize(newAccessToken);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

// ─── Logout ─────────────────────────────────────────
export const logout = async (
  userId: string,
  sessionId: string,
  deviceId?: string,
  allDevices?: boolean
): Promise<void> => {
  if (allDevices) {
    await sessionService.revokeAllSessions(userId);
  } else if (deviceId) {
    await sessionService.revokeSessionByDevice(userId, deviceId);
  } else {
    await sessionService.revokeSession(sessionId);
  }
};

// ─── Get Current User ───────────────────────────────
export interface GetCurrentUserResult {
  user: AuthUserResponseDto & {
    bio?: string;
    activeRole: Record<string, unknown> | null;
    onboardingStatus: string;
    permissions: string[];
    last_login_at?: Date;
    following_count: number;
  };
}

export const getCurrentUser = async (
  userId: string,
  activeRole: Record<string, unknown> | null,
  permissions: string[]
): Promise<GetCurrentUserResult> => {
  const user = await userRepo.findById(userId);
  if (!user) throw new AppError('User not found', 404, ErrorCode.USER_NOT_FOUND);

  const brands = await brandRepo.findByAdminUserId(user._id);
  const outlets = await outletService.getUserOutletsList(user._id);
  await ensureRestaurantOwnerRole(user, outlets);

  const hasCompletedOnboarding =
    user.roles.some((r) => r.role === 'restaurant_owner') &&
    brands.length > 0 &&
    user.currentStep === 'DONE';

  let onboardingStatus: string = 'pending_details';
  if (hasCompletedOnboarding) {
    onboardingStatus = await userRepo.getOnboardingStatus(user._id);
  }

  const followingCount = await followRepo.countByUser(user._id);
  const baseResponse = mapUserToAuthResponse(user, brands, outlets);

  return {
    user: {
      ...baseResponse,
      bio: user.bio,
      activeRole,
      onboardingStatus,
      permissions,
      last_login_at: user.last_login_at,
      following_count: followingCount,
    },
  };
};

// ─── Switch Role ────────────────────────────────────
export interface SwitchRoleResult {
  accessToken: string;
  userId: string;
  activeRole: { scope: string; role: string; brandId?: string; outletId?: string };
}

export const switchRole = async (
  userId: string,
  sessionId: string,
  scope: string,
  role: string,
  brandId?: string,
  outletId?: string
): Promise<SwitchRoleResult> => {
  const canSwitch = await userRepo.hasRole(userId, scope, role, brandId, outletId);
  if (!canSwitch) throw new AuthorizationError('You do not have this role');

  const activeRole = { scope, role, brandId, outletId };
  const user = await userRepo.findById(userId);
  if (!user) throw new AppError('User not found', 404, ErrorCode.USER_NOT_FOUND);

  const newAccessToken = tokenService.generateAccessToken(
    { _id: user._id, roles: user.roles } as any as Parameters<typeof tokenService.generateAccessToken>[0],
    sessionId,
    activeRole
  );

  await userRepo.updatePreferredRole(userId, role);
  validateAccessTokenSize(newAccessToken);

  return { accessToken: newAccessToken, userId: user._id, activeRole };
};

// ─── Helpers ────────────────────────────────────────
function assertUserCanLogin(user: userRepo.UserPlain): void {
  if (user.is_suspended) {
    throw new AppError('Account suspended', 403, ErrorCode.ACCOUNT_SUSPENDED);
  }
  const lockCheck = checkAccountLock(user.locked_until);
  if (lockCheck.isLocked) {
    throw new AppError('Account temporarily locked', 403, ErrorCode.ACCOUNT_LOCKED);
  }
}

async function createAuthSession(
  user: userRepo.UserPlain,
  deviceInfo: DeviceInfo,
  ip: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const initialRefreshToken = tokenService.generateRefreshToken(user._id, '', 1);
  const session = await sessionService.createSession(user._id, initialRefreshToken, {
    device_id: deviceInfo.deviceId,
    device_name: deviceInfo.deviceName,
    device_type: (deviceInfo.deviceType as 'mobile' | 'tablet' | 'desktop' | 'unknown') || 'unknown',
    os: deviceInfo.os,
    browser: deviceInfo.browser,
    ip_address: ip,
  });

  const accessToken = tokenService.generateAccessToken(
    { _id: user._id, roles: user.roles } as any as Parameters<typeof tokenService.generateAccessToken>[0],
    (session as any)._id.toString(),
    undefined
  );
  const refreshToken = tokenService.generateRefreshToken(user._id, (session as any)._id.toString(), 1);
  await sessionService.rotateRefreshToken((session as any)._id.toString(), refreshToken);

  validateAccessTokenSize(accessToken);
  return { accessToken, refreshToken };
}

async function ensureRestaurantOwnerRole(user: userRepo.UserPlain, outlets: unknown[]): Promise<void> {
  if (outlets.length > 0 && !user.roles.some((r) => r.role === 'restaurant_owner')) {
    await userRepo.addRole(user._id, {
      scope: 'platform',
      role: 'restaurant_owner',
      assignedAt: new Date(),
    });
  }
}
