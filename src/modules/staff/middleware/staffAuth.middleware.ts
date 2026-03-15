import { Request, Response, NextFunction } from 'express';
import { staffAuthService, StaffTokenPayload } from '../services/staffAuth.service.js';
import { staffUserRepository } from '../repositories/staffUser.repository.js';

export interface StaffRequest extends Request {
  staffUser?: StaffTokenPayload & { status: string };
}

export const staffAuthenticate = async (req: StaffRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status: false, error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const payload = staffAuthService.verifyToken(token);

    // Verify user still exists and is active
    const user = await staffUserRepository.findById(payload.id);
    if (!user) {
      return res.status(401).json({ status: false, error: 'User not found' });
    }
    if (user.status === 'blocked') {
      return res.status(403).json({ status: false, error: 'Account is blocked' });
    }

    req.staffUser = { ...payload, status: user.status };
    next();
  } catch (err: any) {
    return res.status(401).json({ status: false, error: 'Invalid or expired token' });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: StaffRequest, res: Response, next: NextFunction) => {
    if (!req.staffUser) {
      return res.status(401).json({ status: false, error: 'Unauthorized' });
    }
    if (!roles.includes(req.staffUser.role)) {
      return res.status(403).json({ status: false, error: 'Insufficient permissions' });
    }
    next();
  };
};
