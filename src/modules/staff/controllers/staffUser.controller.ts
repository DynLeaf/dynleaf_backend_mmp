import { Request, Response } from 'express';
import { staffUserService } from '../services/staffUser.service.js';

export const staffUserController = {
  async getAll(req: Request, res: Response) {
    try {
      const { role, status } = req.query as any;
      const users = await staffUserService.getAll({ role, status });
      return res.status(200).json({ status: true, data: users });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const user = await staffUserService.getById(req.params.id);
      return res.status(200).json({ status: true, data: user });
    } catch (err: any) {
      return res.status(404).json({ status: false, error: err.message });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const creator = (req as any).staffUser;
      const user = await staffUserService.create({ ...req.body, createdBy: creator?.id });
      return res.status(201).json({ status: true, data: user, message: 'Staff user created' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async blockUser(req: Request, res: Response) {
    try {
      const user = await staffUserService.blockUser(req.params.id);
      return res.status(200).json({ status: true, data: user, message: 'User blocked' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async unblockUser(req: Request, res: Response) {
    try {
      const user = await staffUserService.unblockUser(req.params.id);
      return res.status(200).json({ status: true, data: user, message: 'User unblocked' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const user = await staffUserService.update(req.params.id, req.body);
      return res.status(200).json({ status: true, data: user });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },
};
