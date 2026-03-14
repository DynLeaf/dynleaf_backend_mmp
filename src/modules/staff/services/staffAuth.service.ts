import jwt from 'jsonwebtoken';
import { staffUserRepository } from '../repositories/staffUser.repository.js';
import { IStaffUser } from '../models/StaffUser.js';

const JWT_SECRET = process.env.STAFF_JWT_SECRET || process.env.JWT_SECRET || 'staff_secret_change_me';
const JWT_EXPIRES_IN = '7d';

export interface StaffTokenPayload {
  id: string;
  role: string;
  name: string;
}

export const staffAuthService = {
  async login(email: string, password: string): Promise<{ token: string; user: Omit<IStaffUser, 'password'> }> {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    const user = await staffUserRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (user.status === 'blocked') {
      throw new Error('Your account has been blocked. Contact an administrator.');
    }

    // comparePassword needs the full document (not lean)
    const { StaffUser } = await import('../models/StaffUser.js');
    const fullUser = await StaffUser.findById(user._id).select('+password');
    if (!fullUser) throw new Error('Invalid credentials');

    const isMatch = await fullUser.comparePassword(password);
    if (!isMatch) {
      throw new Error('Invalid credentials');
    }

    const payload: StaffTokenPayload = {
      id: (user._id as any).toString(),
      role: user.role,
      name: user.name,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    const { password: _pw, ...safeUser } = user as any;
    return { token, user: safeUser };
  },

  verifyToken(token: string): StaffTokenPayload {
    return jwt.verify(token, JWT_SECRET) as StaffTokenPayload;
  },
};
