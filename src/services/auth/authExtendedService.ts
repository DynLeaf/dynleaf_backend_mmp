import jwt from 'jsonwebtoken';
import axios from 'axios';
import * as tokenService from '../tokenService.js';
import * as sessionService from '../sessionService.js';
import * as outletService from '../outletService.js';
import * as userRepo from '../../repositories/userRepository.js';
import * as adminRepo from '../../repositories/adminRepository.js';
import * as brandRepo from '../../repositories/brandRepository.js';
import { createAdminNotification } from '../adminNotificationService.js';
import { AppError, AuthenticationError, ErrorCode } from '../../errors/AppError.js';
import { mapUserToAuthResponse, checkAccountLock } from './authMapper.js';
import { validateAccessTokenSize, type DeviceInfo } from './authService.js';
import { AdminUserDto, AuthUserResponseDto } from '../../dto/auth/index.js';
import * as sessionRepo from '../../repositories/sessionRepository.js';

const ACCOUNT_LOCK_DURATION = 30 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

// ─── Sessions ───────────────────────────────────────
export const getSessions = async (userId: string, currentSessionId: string) => {
  const sessions = await sessionService.getUserSessions(userId);
  return sessions.map((session: { id: unknown; deviceInfo: unknown; lastUsedAt: unknown; createdAt: unknown }) => ({
    ...session,
    isCurrent: String(session.id) === currentSessionId,
  }));
};

export const deleteSession = async (
  sessionId: string,
  requestingUserId: string
): Promise<void> => {
  const session = await sessionRepo.findById(sessionId);
  if (!session) throw new AppError('Session not found', 404, ErrorCode.SESSION_NOT_FOUND);
  if (session.user_id !== requestingUserId) {
    throw new AppError('Unauthorized', 403, ErrorCode.INSUFFICIENT_PERMISSIONS);
  }
  await sessionService.revokeSession(sessionId);
};

// ─── Admin Login ────────────────────────────────────
export interface AdminLoginResult {
  user: AdminUserDto;
  token: string;
}

export const adminLogin = async (
  email: string,
  password: string,
  ip: string,
  userAgent?: string
): Promise<AdminLoginResult> => {
  if (!email || !password) {
    throw new AppError('Email and password are required', 400, ErrorCode.VALIDATION_ERROR);
  }

  const admin = await adminRepo.findByEmail(email);
  if (!admin) throw new AuthenticationError('Invalid credentials');

  const lockCheck = checkAccountLock(admin.locked_until);
  if (lockCheck.isLocked) {
    const minutesLeft = Math.ceil(
      ((lockCheck.locked_until as Date).getTime() - Date.now()) / 60000
    );
    throw new AppError(
      `Account temporarily locked. Try again in ${minutesLeft} minutes`,
      403,
      ErrorCode.ACCOUNT_LOCKED
    );
  }

  if (!admin.is_active) {
    throw new AppError('Account is deactivated', 403, ErrorCode.ACCOUNT_DEACTIVATED);
  }

  const isPasswordValid = await adminRepo.verifyPassword(email, password);
  if (!isPasswordValid) {
    const { locked } = await adminRepo.incrementFailedAttempts(
      email,
      ACCOUNT_LOCK_DURATION,
      MAX_FAILED_ATTEMPTS
    );
    if (locked) {
      throw new AppError(
        'Too many failed login attempts. Account locked for 30 minutes',
        403,
        ErrorCode.ACCOUNT_LOCKED
      );
    }
    throw new AuthenticationError('Invalid credentials');
  }

  await adminRepo.updateLoginMetadata(email, ip, userAgent);

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new AppError('JWT_SECRET is required', 500, ErrorCode.INTERNAL_SERVER_ERROR);

  const token = jwt.sign(
    {
      userId: admin._id,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions,
    },
    jwtSecret,
    { expiresIn: '7d' }
  );

  return {
    user: {
      id: admin._id,
      email: admin.email,
      name: admin.full_name,
      role: admin.role,
      permissions: admin.permissions,
    },
    token,
  };
};

// ─── Google OAuth ───────────────────────────────────
interface GoogleProfile {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

export interface GoogleExchangeResult {
  user: AuthUserResponseDto;
  accessToken: string;
  refreshToken: string;
}

export const exchangeGoogleCode = async (
  code: string,
  redirectUri: string | undefined,
  deviceInfo: DeviceInfo | undefined,
  ip: string
): Promise<GoogleExchangeResult> => {
  if (!code) throw new AppError('Authorization code is required', 400, ErrorCode.VALIDATION_ERROR);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new AppError('Google OAuth is not configured on the server', 500, ErrorCode.GOOGLE_OAUTH_ERROR);
  }

  const effectiveRedirectUri = redirectUri || process.env.GOOGLE_REDIRECT_URI || '';
  const googleProfile = await fetchGoogleProfile(code, clientId, clientSecret, effectiveRedirectUri);

  let userPlain = await userRepo.findByGoogleId(googleProfile.sub);
  let isNewUser = false;

  if (!userPlain && googleProfile.email) {
    userPlain = await userRepo.findByEmail(googleProfile.email);
    if (userPlain) {
      await userRepo.linkGoogleAccount(userPlain._id, googleProfile.sub, {
        avatar_url: googleProfile.picture,
        full_name: googleProfile.name,
      });
      userPlain = await userRepo.findById(userPlain._id);
    }
  }

  if (!userPlain) {
    isNewUser = true;
    userPlain = await userRepo.create({
      google_id: googleProfile.sub,
      email: googleProfile.email,
      full_name: googleProfile.name,
      avatar_url: googleProfile.picture,
      roles: [{ scope: 'platform', role: 'customer', assignedAt: new Date() }],
      is_verified: true,
      is_active: true,
      currentStep: 'BRAND',
    });
    createAdminNotification({
      title: 'New User Joined',
      message: `A new user registered via Google${googleProfile.email ? ` (${googleProfile.email})` : ''}.`,
      type: 'user',
      referenceId: userPlain._id,
    });
  }

  if (!userPlain) throw new AppError('Failed to create or find user', 500, ErrorCode.INTERNAL_SERVER_ERROR);

  if (userPlain.is_suspended) throw new AppError('Account suspended', 403, ErrorCode.ACCOUNT_SUSPENDED);
  const lockCheck = checkAccountLock(userPlain.locked_until);
  if (lockCheck.isLocked) throw new AppError('Account temporarily locked', 403, ErrorCode.ACCOUNT_LOCKED);

  const effectiveDeviceInfo: DeviceInfo = {
    deviceId: deviceInfo?.deviceId || `google-oauth-${Date.now()}`,
    deviceName: deviceInfo?.deviceName || 'Google Sign-In',
    deviceType: deviceInfo?.deviceType || 'web',
    os: deviceInfo?.os || 'unknown',
    browser: deviceInfo?.browser || 'unknown',
  };

  const initialRefreshToken = tokenService.generateRefreshToken(userPlain._id, '', 1);
  const session = await sessionService.createSession(userPlain._id, initialRefreshToken, {
    device_id: effectiveDeviceInfo.deviceId,
    device_name: effectiveDeviceInfo.deviceName,
    device_type: (effectiveDeviceInfo.deviceType as 'mobile' | 'tablet' | 'desktop' | 'unknown') || 'unknown',
    os: effectiveDeviceInfo.os,
    browser: effectiveDeviceInfo.browser,
    ip_address: ip,
  });

  const accessToken = tokenService.generateAccessToken(
    { _id: userPlain._id, roles: userPlain.roles } as any as Parameters<typeof tokenService.generateAccessToken>[0],
    (session as any)._id.toString(),
    undefined
  );
  const refreshToken = tokenService.generateRefreshToken(userPlain._id, (session as any)._id.toString(), 1);
  await sessionService.rotateRefreshToken((session as any)._id.toString(), refreshToken);

  validateAccessTokenSize(accessToken);
  await userRepo.updateLoginMetadata(userPlain._id, ip, effectiveDeviceInfo.deviceName);

  const brands = await brandRepo.findByAdminUserId(userPlain._id);
  const outlets = await outletService.getUserOutletsList(userPlain._id);

  const freshUser = await userRepo.findById(userPlain._id);
  if (!freshUser) throw new AppError('User not found after update', 500, ErrorCode.INTERNAL_SERVER_ERROR);

  return {
    user: mapUserToAuthResponse(freshUser, brands, outlets, { isNewUser }),
    accessToken,
    refreshToken,
  };
};

async function fetchGoogleProfile(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<GoogleProfile> {
  let accessTokenData: { access_token: string };
  try {
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    accessTokenData = tokenResponse.data;
  } catch (tokenError: unknown) {
    const axiosErr = tokenError as { response?: { data?: { error_description?: string; error?: string } }; message?: string };
    const googleErr = axiosErr.response?.data;
    const detail = googleErr?.error_description || googleErr?.error || axiosErr.message || 'unknown';
    throw new AppError(
      `Failed to exchange Google authorization code: ${detail}`,
      401,
      ErrorCode.GOOGLE_OAUTH_ERROR
    );
  }

  try {
    const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessTokenData.access_token}` },
    });
    return profileResponse.data as GoogleProfile;
  } catch {
    throw new AppError('Failed to fetch Google user profile', 401, ErrorCode.GOOGLE_OAUTH_ERROR);
  }
}
