import { Response } from 'express';
import { earningsService } from '../services/earnings.service.js';
import { StaffRequest } from '../middleware/staffAuth.middleware.js';

export const earningsController = {
  async getMyEarnings(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const earnings = await earningsService.getEarningsByCrafter(id);
      return res.status(200).json({ status: true, data: earnings });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getMySummary(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const summary = await earningsService.getEarningsSummary(id);
      return res.status(200).json({ status: true, data: summary });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getMyPayouts(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const payouts = await earningsService.getPayoutsByCrafter(id);
      return res.status(200).json({ status: true, data: payouts });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  // Admin endpoints
  async getAllPayouts(req: StaffRequest, res: Response) {
    try {
      const { status } = req.query as Record<string, string>;
      const payoutStatus = status === 'pending' || status === 'paid' ? status : undefined;
      const payouts = await earningsService.getAllPayouts(payoutStatus);
      return res.status(200).json({ status: true, data: payouts });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getAllEarnings(req: StaffRequest, res: Response) {
    try {
      const { status, crafterId, page, limit } = req.query as Record<string, string>;

      if (page || limit) {
        const p = parseInt(page) || 1;
        const l = parseInt(limit) || 15;
        const { data, total } = await earningsService.getPaginatedEarnings({
          crafterId,
          status,
          page: p,
          limit: l
        });

        return res.status(200).json({
          status: true,
          data,
          pagination: {
            total,
            page: p,
            limit: l,
            pages: Math.ceil(total / l)
          }
        });
      }

      const filter: { status?: string; crafterId?: string } = {};
      if (status) filter.status = status;
      if (crafterId) filter.crafterId = crafterId;
      const earnings = await earningsService.getAllEarnings(filter);
      return res.status(200).json({ status: true, data: earnings });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async updateEarningsStatus(req: StaffRequest, res: Response) {
    try {
      const { ids, status } = req.body;
      if (!ids || !Array.isArray(ids)) throw new Error('IDs array is required');
      if (!['pending', 'paid'].includes(status)) throw new Error('Invalid status');
      await earningsService.updateEarningsStatus(ids, status);
      return res.status(200).json({ status: true, message: 'Earnings status updated' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getPendingPayouts(req: StaffRequest, res: Response) {
    try {
      const payouts = await earningsService.getPendingPayouts();
      return res.status(200).json({ status: true, data: payouts });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async createPayout(req: StaffRequest, res: Response) {
    try {
      const payout = await earningsService.createPayout(req.body);
      return res.status(201).json({ status: true, data: payout, message: 'Payout created' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async markPayoutPaid(req: StaffRequest, res: Response) {
    try {
      const admin = req.staffUser;
      const adminId = admin?.id;
      const { note } = req.body;
      if (!note?.trim()) return res.status(400).json({ status: false, error: 'Note is required' });
      const payout = await earningsService.markPayoutPaid(req.params.id, note, adminId ?? '');
      return res.status(200).json({ status: true, data: payout, message: 'Payout marked as paid' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },
};
