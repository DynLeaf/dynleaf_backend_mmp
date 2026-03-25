import { Request } from 'express';
import mongoose from 'mongoose';

export type UserRoleScope = 'platform' | 'brand' | 'outlet';
export type UserRoleName = 'customer' | 'restaurant_owner' | 'admin' | 'manager' | 'staff';

export interface UserRole {
  scope: UserRoleScope;
  role: UserRoleName;
  brandId?: mongoose.Types.ObjectId;
  outletId?: mongoose.Types.ObjectId;
  permissions?: string[];
  assignedAt: Date;
  assignedBy?: mongoose.Types.ObjectId;
}

export interface ActiveRole {
  scope: UserRoleScope;
  role: UserRoleName;
  brandId?: string;
  outletId?: string;
}

export interface AuthenticatedUser {
  id: string;
  phone?: string;
  roles: UserRole[];
  activeRole: ActiveRole | null;
  permissions: string[];
  sessionId: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
  outlet?: Record<string, unknown>;
  subscription?: Record<string, unknown>;
}
