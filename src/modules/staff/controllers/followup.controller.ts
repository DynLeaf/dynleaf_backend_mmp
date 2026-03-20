import { Response } from 'express';
import { followupService } from '../services/followup.service.js';
import type { FollowupFilter } from '../services/followup.service.js';
import { StaffRequest } from '../middleware/staffAuth.middleware.js';

export const followupController = {
  async getByCustomer(req: StaffRequest, res: Response) {
    try {
      const followups = await followupService.getByCustomer(req.params.customerId);
      return res.status(200).json({ status: true, data: followups });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getMine(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
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
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getToday(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const followups = await followupService.getTodayBySalesperson(id);
      return res.status(200).json({ status: true, data: followups });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getMissed(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const followups = await followupService.getMissed(id);
      return res.status(200).json({ status: true, data: followups });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async create(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const followup = await followupService.create({ ...req.body, salespersonId: id });
      return res.status(201).json({ status: true, data: followup, message: 'Followup created' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async reschedule(req: StaffRequest, res: Response) {
    try {
      const followup = await followupService.reschedule(req.params.id, req.body);
      return res.status(200).json({ status: true, data: followup, message: 'Followup rescheduled' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async addNote(req: StaffRequest, res: Response) {
    try {
      const { message } = req.body;
      if (!message?.trim()) return res.status(400).json({ status: false, error: 'Message is required' });
      const followup = await followupService.addNote(req.params.id, message);
      return res.status(200).json({ status: true, data: followup });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async markDone(req: StaffRequest, res: Response) {
    try {
      const { message } = req.body;
      const followup = await followupService.markDone(req.params.id, message);
      return res.status(200).json({ status: true, data: followup, message: 'Followup marked as done' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  /** GET /followups?filter=today|missed|all|upcoming&search=&page=&limit=&sortBy=&sortOrder=&status= */
  async getFiltered(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const {
        filter = 'all',
        search,
        status,
        sortBy,
        sortOrder,
        page,
        limit,
      } = req.query as Record<string, string>;

      const validFilters: FollowupFilter[] = ['today', 'missed', 'upcoming', 'all'];
      const safeFilter: FollowupFilter = validFilters.includes(filter as FollowupFilter)
        ? (filter as FollowupFilter)
        : 'all';

      const result = await followupService.getFiltered({
        salespersonId: id,
        filter: safeFilter,
        search,
        status,
        sortBy,
        sortOrder,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
      });

      return res.status(200).json({
        status: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  /** GET /followups/stats */
  async getStats(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const stats = await followupService.getStats(id);
      return res.status(200).json({ status: true, data: stats });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },
};
