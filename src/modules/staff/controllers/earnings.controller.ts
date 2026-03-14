import { Request, Response } from 'express';
import { earningsService } from '../services/earnings.service.js';

export const earningsController = {
  async getMyEarnings(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const earnings = await earningsService.getEarningsByCrafter(id);
      return res.status(200).json({ status: true, data: earnings });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getMySummary(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const summary = await earningsService.getEarningsSummary(id);
      return res.status(200).json({ status: true, data: summary });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getMyPayouts(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const payouts = await earningsService.getPayoutsByCrafter(id);
      return res.status(200).json({ status: true, data: payouts });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  // Admin endpoints
  async getAllPayouts(req: Request, res: Response) {
    try {
      const status = req.query.status as any;
      const payouts = await earningsService.getAllPayouts(status);
      return res.status(200).json({ status: true, data: payouts });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getAllEarnings(req: Request, res: Response) {
    try {
      const { status, crafterId } = req.query as any;
      const filter: any = {};
      if (status) filter.status = status;
      if (crafterId) filter.crafterId = crafterId;
      const earnings = await earningsService.getAllEarnings(filter);
      return res.status(200).json({ status: true, data: earnings });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async updateEarningsStatus(req: Request, res: Response) {
    try {
      const { ids, status } = req.body;
      if (!ids || !Array.isArray(ids)) throw new Error('IDs array is required');
      if (!['pending', 'paid'].includes(status)) throw new Error('Invalid status');
      await earningsService.updateEarningsStatus(ids, status);
      return res.status(200).json({ status: true, message: 'Earnings status updated' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getPendingPayouts(req: Request, res: Response) {
    try {
      const payouts = await earningsService.getPendingPayouts();
      return res.status(200).json({ status: true, data: payouts });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async createPayout(req: Request, res: Response) {
    try {
      const payout = await earningsService.createPayout(req.body);
      return res.status(201).json({ status: true, data: payout, message: 'Payout created' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async markPayoutPaid(req: Request, res: Response) {
    try {
      const admin = (req as any).staffUser || (req as any).admin;
      const adminId = admin?.id || admin?._id?.toString();
      const { note } = req.body;
      if (!note?.trim()) return res.status(400).json({ status: false, error: 'Note is required' });
      const payout = await earningsService.markPayoutPaid(req.params.id, note, adminId);
      return res.status(200).json({ status: true, data: payout, message: 'Payout marked as paid' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },
};
