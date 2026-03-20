import { StaffUser, IStaffUser, StaffRole, StaffStatus } from '../models/StaffUser.js';
import mongoose from 'mongoose';

export const staffUserRepository = {
  async findById(id: string): Promise<IStaffUser | null> {
    return StaffUser.findById(id).lean();
  },

  async findByIdWithPassword(id: string): Promise<IStaffUser | null> {
    return StaffUser.findById(id).select('+password').lean();
  },

  async findByEmail(email: string): Promise<IStaffUser | null> {
    return StaffUser.findOne({ email: email.toLowerCase() }).select('+password').lean();
  },

  async findAll(filter: Partial<{ role: StaffRole; status: StaffStatus }> = {}): Promise<IStaffUser[]> {
    const query: Record<string, unknown> = {};
    if (filter.role) query.role = filter.role;
    if (filter.status) query.status = filter.status;

    return StaffUser.find(query).select('-password').sort({ createdAt: -1 }).lean();
  },

  async create(data: {
    name: string;
    email: string;
    password: string;
    role: StaffRole;
    createdBy?: string;
  }): Promise<IStaffUser> {
    const user = new StaffUser(data);
    return user.save();
  },

  async updateStatus(id: string, status: StaffStatus): Promise<IStaffUser | null> {
    return StaffUser.findByIdAndUpdate(id, { status }, { new: true }).select('-password').lean();
  },

  async updateById(id: string, data: Partial<Pick<IStaffUser, 'name' | 'email' | 'role'>>): Promise<IStaffUser | null> {
    return StaffUser.findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .select('-password')
      .lean();
  },

  async countByRole(role: StaffRole): Promise<number> {
    return StaffUser.countDocuments({ role });
  },
};
