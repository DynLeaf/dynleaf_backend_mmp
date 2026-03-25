import { Response } from 'express';
import { staffAuthService } from '../services/staffAuth.service.js';
import { staffUserRepository } from '../repositories/staffUser.repository.js';
import { StaffRequest } from '../middleware/staffAuth.middleware.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 1000, // 1 hour
  path: '/',
};

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/v1/staff/auth', // only sent to auth endpoints
};

const setAuthCookies = (res: Response, accessToken: string, refreshToken: string) => {
  res.cookie('staff_access_token', accessToken, ACCESS_COOKIE_OPTIONS);
  res.cookie('staff_refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS);
};

const clearAuthCookies = (res: Response) => {
  res.clearCookie('staff_access_token', { path: '/' });
  res.clearCookie('staff_refresh_token', { path: '/v1/staff/auth' });
};

export const staffAuthController = {
  async login(req: StaffRequest, res: Response) {
    try {
      const { email, password } = req.body;
      const { accessToken, refreshToken, user } = await staffAuthService.login(email, password);

      setAuthCookies(res, accessToken, refreshToken);

      return res.status(200).json({ status: true, data: { user }, message: 'Login successful' });
    } catch (err: unknown) {
      return res.status(401).json({ status: false, error: (err as Error).message });
    }
  },

  async refresh(req: StaffRequest, res: Response) {
    try {
      const refreshToken = req.cookies?.staff_refresh_token as string | undefined;

      if (!refreshToken) {
        return res.status(401).json({ status: false, error: 'Refresh token is required' });
      }

      const decoded = staffAuthService.verifyRefreshToken(refreshToken);

      // Verify user still exists and is active
      const user = await staffUserRepository.findById(decoded.id);
      if (!user) {
        clearAuthCookies(res);
        return res.status(401).json({ status: false, error: 'User not found' });
      }
      if (user.status === 'blocked') {
        clearAuthCookies(res);
        return res.status(403).json({ status: false, error: 'Account is blocked' });
      }

      const newAccessToken = staffAuthService.generateAccessToken({
        id: String(user._id),
        role: user.role,
        name: user.name,
      });
      const newRefreshToken = staffAuthService.generateRefreshToken(String(user._id));

      setAuthCookies(res, newAccessToken, newRefreshToken);

      return res.status(200).json({
        status: true,
        data: null,
        message: 'Token refreshed successfully',
      });
    } catch (err: unknown) {
      clearAuthCookies(res);
      return res.status(401).json({ status: false, error: 'Invalid or expired refresh token' });
    }
  },

  async logout(req: StaffRequest, res: Response) {
    clearAuthCookies(res);
    return res.status(200).json({ status: true, data: null, message: 'Logged out successfully' });
  },

  async me(req: StaffRequest, res: Response) {
    // staffAuthMiddleware attaches req.staffUser
    return res.status(200).json({ status: true, data: req.staffUser });
  },
};
