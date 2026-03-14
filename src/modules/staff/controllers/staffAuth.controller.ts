import { Request, Response } from 'express';
import { staffAuthService } from '../services/staffAuth.service.js';

export const staffAuthController = {
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const result = await staffAuthService.login(email, password);
      return res.status(200).json({ status: true, data: result, message: 'Login successful' });
    } catch (err: any) {
      return res.status(401).json({ status: false, error: err.message });
    }
  },

  async me(req: Request, res: Response) {
    // staffAuthMiddleware attaches req.staffUser
    return res.status(200).json({ status: true, data: (req as any).staffUser });
  },
};
