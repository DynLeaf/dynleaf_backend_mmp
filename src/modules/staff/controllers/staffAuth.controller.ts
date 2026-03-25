import { Response } from 'express';
import { staffAuthService } from '../services/staffAuth.service.js';
import { staffUserRepository } from '../repositories/staffUser.repository.js';
import { StaffRequest } from '../middleware/staffAuth.middleware.js';

export const staffAuthController = {
  async login(req: StaffRequest, res: Response) {
    try {
      const { email, password } = req.body;
      const result = await staffAuthService.login(email, password);
      return res.status(200).json({ status: true, data: result, message: 'Login successful' });
    } catch (err: unknown) {
      return res.status(401).json({ status: false, error: (err as Error).message });
    }
  },

  async refresh(req: StaffRequest, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ status: false, error: 'Refresh token is required' });
      }

      const decoded = staffAuthService.verifyRefreshToken(refreshToken);

      // Verify user still exists and is active
      const user = await staffUserRepository.findById(decoded.id);
      if (!user) {
        return res.status(401).json({ status: false, error: 'User not found' });
      }
      if (user.status === 'blocked') {
        return res.status(403).json({ status: false, error: 'Account is blocked' });
      }

      const accessToken = staffAuthService.generateAccessToken({
        id: String(user._id),
        role: user.role,
        name: user.name,
      });
      const newRefreshToken = staffAuthService.generateRefreshToken(String(user._id));

      return res.status(200).json({
        status: true,
        data: { accessToken, refreshToken: newRefreshToken },
        message: 'Token refreshed successfully',
      });
    } catch (err: unknown) {
      return res.status(401).json({ status: false, error: 'Invalid or expired refresh token' });
    }
  },

  async me(req: StaffRequest, res: Response) {
    // staffAuthMiddleware attaches req.staffUser
    return res.status(200).json({ status: true, data: req.staffUser });
  },
};
