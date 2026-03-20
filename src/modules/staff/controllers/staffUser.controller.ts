import { Response } from 'express';
import { staffUserService } from '../services/staffUser.service.js';
import { StaffRequest } from '../middleware/staffAuth.middleware.js';
import { StaffRole, StaffStatus } from '../models/StaffUser.js';

export const staffUserController = {
  async getAll(req: StaffRequest, res: Response) {
    try {
      const { role, status } = req.query as Record<string, string>;
      const users = await staffUserService.getAll({
        role: role as StaffRole | undefined,
        status: status as StaffStatus | undefined,
      });
      return res.status(200).json({ status: true, data: users });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getById(req: StaffRequest, res: Response) {
    try {
      const user = await staffUserService.getById(req.params.id);
      return res.status(200).json({ status: true, data: user });
    } catch (err: unknown) {
      return res.status(404).json({ status: false, error: (err as Error).message });
    }
  },

  async create(req: StaffRequest, res: Response) {
    try {
      const creator = req.staffUser;
      const user = await staffUserService.create({ ...req.body, createdBy: creator?.id });
      return res.status(201).json({ status: true, data: user, message: 'Staff user created' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async blockUser(req: StaffRequest, res: Response) {
    try {
      const requesterId = req.staffUser?.id;
      const user = await staffUserService.blockUser(req.params.id, requesterId);
      return res.status(200).json({ status: true, data: user, message: 'User blocked' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async unblockUser(req: StaffRequest, res: Response) {
    try {
      const user = await staffUserService.unblockUser(req.params.id);
      return res.status(200).json({ status: true, data: user, message: 'User unblocked' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async update(req: StaffRequest, res: Response) {
    try {
      const user = await staffUserService.update(req.params.id, req.body);
      return res.status(200).json({ status: true, data: user });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },
};
