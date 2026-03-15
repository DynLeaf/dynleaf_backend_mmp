import { Request, Response } from 'express';
import { followupService } from '../services/followup.service.js';

export const followupController = {
  async getByCustomer(req: Request, res: Response) {
    try {
      const followups = await followupService.getByCustomer(req.params.customerId);
      return res.status(200).json({ status: true, data: followups });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getMine(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const { status, sortBy, sortOrder, page, limit } = req.query as Record<string, string>;
      const result = await followupService.getPaginated({
        salespersonId: id,
        status,
        sortBy,
        sortOrder,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
      });
      return res.status(200).json({ status: true, data: result.data, pagination: result.pagination });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getToday(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const followups = await followupService.getTodayBySalesperson(id);
      return res.status(200).json({ status: true, data: followups });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getMissed(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const followups = await followupService.getMissed(id);
      return res.status(200).json({ status: true, data: followups });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const followup = await followupService.create({ ...req.body, salespersonId: id });
      return res.status(201).json({ status: true, data: followup, message: 'Followup created' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async reschedule(req: Request, res: Response) {
    try {
      const followup = await followupService.reschedule(req.params.id, req.body);
      return res.status(200).json({ status: true, data: followup, message: 'Followup rescheduled' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async addNote(req: Request, res: Response) {
    try {
      const { message } = req.body;
      if (!message?.trim()) return res.status(400).json({ status: false, error: 'Message is required' });
      const followup = await followupService.addNote(req.params.id, message);
      return res.status(200).json({ status: true, data: followup });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async markDone(req: Request, res: Response) {
    try {
      const { message } = req.body;
      const followup = await followupService.markDone(req.params.id, message);
      return res.status(200).json({ status: true, data: followup, message: 'Followup marked as done' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },
};
