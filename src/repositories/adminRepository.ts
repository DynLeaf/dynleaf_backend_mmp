import { Admin } from '../models/Admin.js';

export interface AdminPlain {
  _id: string;
  email: string;
  full_name: string;
  role: 'super_admin' | 'admin' | 'moderator';
  is_active: boolean;
  permissions: string[];
  last_login_at?: Date;
  last_login_ip?: string;
  last_login_device?: string;
  failed_login_attempts: number;
  locked_until?: Date;
}

export const findByEmail = async (email: string): Promise<AdminPlain | null> => {
  const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
  if (!admin) return null;
  return {
    _id: String(admin._id),
    email: admin.email,
    full_name: admin.full_name,
    role: admin.role,
    is_active: admin.is_active,
    permissions: admin.permissions,
    last_login_at: admin.last_login_at,
    last_login_ip: admin.last_login_ip,
    last_login_device: admin.last_login_device,
    failed_login_attempts: admin.failed_login_attempts,
    locked_until: admin.locked_until,
  };
};

export const verifyPassword = async (email: string, password: string): Promise<boolean> => {
  const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
  if (!admin) return false;
  return admin.comparePassword(password);
};

export const incrementFailedAttempts = async (email: string, lockDuration: number, maxAttempts: number): Promise<{ locked: boolean }> => {
  const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
  if (!admin) return { locked: false };

  admin.failed_login_attempts += 1;
  if (admin.failed_login_attempts >= maxAttempts) {
    admin.locked_until = new Date(Date.now() + lockDuration);
    await admin.save();
    return { locked: true };
  }
  await admin.save();
  return { locked: false };
};

export const updateLoginMetadata = async (
  email: string,
  ip: string,
  device?: string
): Promise<void> => {
  await Admin.findOneAndUpdate(
    { email: email.toLowerCase().trim() },
    {
      last_login_at: new Date(),
      last_login_ip: ip,
      ...(device ? { last_login_device: device } : {}),
      failed_login_attempts: 0,
      $unset: { locked_until: '' },
    }
  );
};
