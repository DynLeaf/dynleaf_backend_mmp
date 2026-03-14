import { staffUserRepository } from '../repositories/staffUser.repository.js';
import { IStaffUser, StaffRole, StaffStatus } from '../models/StaffUser.js';

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

    const roles: StaffRole[] = ['salesman', 'crafter', 'admin'];
    if (!roles.includes(data.role)) throw new Error('Invalid role');

    const existing = await staffUserRepository.findByEmail(data.email);
    if (existing) throw new Error('Email already in use');

    return staffUserRepository.create(data);
  },

  async updateStatus(id: string, status: StaffStatus): Promise<IStaffUser> {
    const user = await staffUserRepository.updateStatus(id, status);
    if (!user) throw new Error('Staff user not found');
    return user;
  },

  async blockUser(id: string): Promise<IStaffUser> {
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
