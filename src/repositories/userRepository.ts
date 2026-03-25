import mongoose from 'mongoose';
import { User, IUser } from '../models/User.js';
import { OnboardingRequest } from '../models/OnboardingRequest.js';

export interface UserPlain {
  _id: string;
  username?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  google_id?: string;
  avatar_url?: string;
  bio?: string;
  roles: IUser['roles'];
  is_verified: boolean;
  is_active: boolean;
  is_suspended: boolean;
  suspension_reason?: string;
  currentStep: string;
  last_login_at?: Date;
  last_login_ip?: string;
  last_login_device?: string;
  failed_login_attempts: number;
  locked_until?: Date;
  preferred_role?: string;
  saved_items?: IUser['saved_items'];
  shared_items?: IUser['shared_items'];
}

const toPlain = (user: IUser): UserPlain => {
  const obj = user.toObject();
  return { ...obj, _id: String(obj._id) };
};

export const findByPhone = async (phone: string): Promise<UserPlain | null> => {
  const user = await User.findOne({ phone });
  return user ? toPlain(user) : null;
};

export const findById = async (id: string): Promise<UserPlain | null> => {
  const user = await User.findById(id);
  return user ? toPlain(user) : null;
};

export const findByGoogleId = async (googleId: string): Promise<UserPlain | null> => {
  const user = await User.findOne({ google_id: googleId });
  return user ? toPlain(user) : null;
};

export const findByUsername = async (username: string): Promise<UserPlain | null> => {
  const user = await User.findOne({ username });
  return user ? toPlain(user) : null;
};

export const findByEmail = async (email: string): Promise<UserPlain | null> => {
  const user = await User.findOne({ email });
  return user ? toPlain(user) : null;
};

export interface CreateUserData {
  phone?: string;
  email?: string;
  google_id?: string;
  full_name?: string;
  avatar_url?: string;
  roles: IUser['roles'];
  is_verified: boolean;
  is_active: boolean;
  currentStep: string;
}

export const create = async (data: CreateUserData): Promise<UserPlain> => {
  const user = await User.create(data);
  return toPlain(user);
};

export const linkGoogleAccount = async (
  userId: string,
  googleId: string,
  updates: { avatar_url?: string; full_name?: string }
): Promise<UserPlain | null> => {
  const user = await User.findById(userId);
  if (!user) return null;
  user.google_id = googleId;
  if (!user.avatar_url && updates.avatar_url) user.avatar_url = updates.avatar_url;
  if (!user.full_name && updates.full_name) user.full_name = updates.full_name;
  await user.save();
  return toPlain(user);
};

export const updateLoginMetadata = async (
  userId: string,
  ip: string,
  device?: string
): Promise<void> => {
  await User.findByIdAndUpdate(userId, {
    last_login_at: new Date(),
    last_login_ip: ip,
    ...(device ? { last_login_device: device } : {}),
    failed_login_attempts: 0,
    $unset: { locked_until: '' },
  });
};

export const addBrandManagerRole = async (
  userId: string,
  brandId: string | mongoose.Types.ObjectId
): Promise<void> => {
  await User.findByIdAndUpdate(userId, {
    $push: { roles: { scope: 'brand', role: 'manager', brandId } },
    currentStep: 'OUTLET'
  });
};

export const addRole = async (
  userId: string,
  role: IUser['roles'][0]
): Promise<void> => {
  await User.findByIdAndUpdate(userId, { $push: { roles: role } });
};

export const addOutletRole = async (
  userId: string,
  roleData: any
): Promise<void> => {
  await User.findByIdAndUpdate(userId, { $push: { roles: roleData } });
};

export const updatePreferredRole = async (
  userId: string,
  role: string
): Promise<void> => {
  await User.findByIdAndUpdate(userId, { preferred_role: role });
};

export const hasRole = async (
  userId: string,
  scope: string,
  role: string,
  brandId?: string,
  outletId?: string
): Promise<boolean> => {
  const user = await User.findById(userId).select('roles').lean();
  if (!user) return false;
  return user.roles.some((r) => {
    if (r.scope !== scope || r.role !== role) return false;
    if (brandId && r.brandId?.toString() !== brandId) return false;
    if (outletId && r.outletId?.toString() !== outletId) return false;
    return true;
  });
};

export const getOnboardingStatus = async (
  userId: string
): Promise<'pending_details' | 'pending_approval' | 'approved' | 'rejected'> => {
  const request = await OnboardingRequest.findOne({ user_id: userId })
    .sort({ created_at: -1 })
    .lean();
  if (request) return request.status as 'pending_details' | 'pending_approval' | 'approved' | 'rejected';
  return 'pending_approval';
};

export const updateProfile = async (
  userId: string,
  updates: { full_name?: string; email?: string; phone?: string; bio?: string; avatar_url?: string }
): Promise<UserPlain | null> => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true, runValidators: true }
  );
  return user ? toPlain(user) : null;
};

export const getSavedAndSharedItems = async (userId: string) => {
  const user = await User.findById(userId).select('saved_items shared_items').lean();
  if (!user) return null;
  return {
    saved_items: user.saved_items || [],
    shared_items: user.shared_items || [],
  };
};

export const updateSavedItems = async (userId: string, savedItems: any[]): Promise<void> => {
  await User.findByIdAndUpdate(userId, { saved_items: savedItems });
};

export const updateSharedItems = async (userId: string, sharedItems: any[]): Promise<void> => {
  await User.findByIdAndUpdate(userId, { shared_items: sharedItems });
};
