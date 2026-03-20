import { Response } from 'express';
import { staffAuthService } from '../services/staffAuth.service.js';
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

  async me(req: StaffRequest, res: Response) {
    // staffAuthMiddleware attaches req.staffUser
    return res.status(200).json({ status: true, data: req.staffUser });
  },
};
