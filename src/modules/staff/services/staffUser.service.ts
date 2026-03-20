import { staffUserRepository } from '../repositories/staffUser.repository.js';
import { IStaffUser, StaffRole, StaffStatus } from '../models/StaffUser.js';

export type { IStaffUser, StaffRole, StaffStatus };

export const staffUserService = {
  async getAll(filter?: { role?: StaffRole; status?: StaffStatus }): Promise<IStaffUser[]> {
    return staffUserRepository.findAll(filter);
  },

  async getById(id: string): Promise<IStaffUser> {
    const user = await staffUserRepository.findById(id);
    if (!user) throw new Error('Staff user not found');
    return user;
  },

  async create(data: {
    name: string;
    email: string;
    password: string;
    role: StaffRole;
    createdBy?: string;
  }): Promise<IStaffUser> {
    if (!data.name?.trim()) throw new Error('Name is required');
    if (!data.email?.trim()) throw new Error('Email is required');
    if (!data.password || data.password.length < 6) throw new Error('Password must be at least 6 characters');

    // Only non-admin roles can be created by staff admins
    const allowedCreationRoles: StaffRole[] = ['salesman', 'crafter'];
    if (!allowedCreationRoles.includes(data.role)) {
      throw new Error(`Role '${data.role}' cannot be assigned during user creation. Allowed roles: salesman, crafter`);
    }

    const existing = await staffUserRepository.findByEmail(data.email);
    if (existing) throw new Error('Email already in use');

    return staffUserRepository.create(data);
  },

  async updateStatus(id: string, status: StaffStatus): Promise<IStaffUser> {
    const user = await staffUserRepository.updateStatus(id, status);
    if (!user) throw new Error('Staff user not found');
    return user;
  },

  async blockUser(id: string, requesterId?: string): Promise<IStaffUser> {
    const target = await staffUserRepository.findById(id);
    if (!target) throw new Error('Staff user not found');

    // Prevent blocking admin-role users
    if (target.role === 'admin') {
      throw new Error('Admin users cannot be blocked');
    }

    // Prevent self-blocking
    if (requesterId && String(target._id) === String(requesterId)) {
      throw new Error('You cannot block your own account');
    }

    return this.updateStatus(id, 'blocked');
  },

  async unblockUser(id: string): Promise<IStaffUser> {
    return this.updateStatus(id, 'active');
  },

  async update(id: string, data: Partial<Pick<IStaffUser, 'name' | 'email' | 'role'>>): Promise<IStaffUser> {
    const user = await staffUserRepository.updateById(id, data);
    if (!user) throw new Error('Staff user not found');
    return user;
  },
};
