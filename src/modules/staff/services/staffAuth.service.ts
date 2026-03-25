import jwt from 'jsonwebtoken';
import { staffUserRepository } from '../repositories/staffUser.repository.js';
import { IStaffUser } from '../models/StaffUser.js';

const JWT_SECRET = process.env.STAFF_JWT_SECRET || process.env.JWT_SECRET || 'staff_secret_change_me';
const REFRESH_SECRET = process.env.STAFF_REFRESH_SECRET || JWT_SECRET + '_refresh';
const ACCESS_TOKEN_EXPIRES_IN = '1h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

export interface StaffTokenPayload {
  id: string;
  role: string;
  name: string;
}

export interface StaffRefreshTokenPayload {
  id: string;
  type: 'refresh';
}

export const staffAuthService = {
  generateAccessToken(payload: StaffTokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
  },

  generateRefreshToken(userId: string): string {
    const payload: StaffRefreshTokenPayload = { id: userId, type: 'refresh' };
    return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
  },

  async login(email: string, password: string): Promise<{ accessToken: string; refreshToken: string; user: Omit<IStaffUser, 'password'> }> {
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
    const fullUser = await staffUserRepository.findDocumentByIdWithPassword(String(user._id));
    if (!fullUser) throw new Error('Invalid credentials');

    const isMatch = await fullUser.comparePassword(password);
    if (!isMatch) {
      throw new Error('Invalid credentials');
    }

    const tokenPayload: StaffTokenPayload = {
      id: String(user._id),
      role: user.role,
      name: user.name,
    };

    const accessToken = this.generateAccessToken(tokenPayload);
    const refreshToken = this.generateRefreshToken(String(user._id));

    const { password: _pw, ...safeUser } = user as IStaffUser & { password?: string };
    return { accessToken, refreshToken, user: safeUser as Omit<IStaffUser, 'password'> };
  },

  verifyToken(token: string): StaffTokenPayload {
    return jwt.verify(token, JWT_SECRET) as StaffTokenPayload;
  },

  verifyRefreshToken(token: string): StaffRefreshTokenPayload {
    const decoded = jwt.verify(token, REFRESH_SECRET) as StaffRefreshTokenPayload;
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    return decoded;
  },
};
