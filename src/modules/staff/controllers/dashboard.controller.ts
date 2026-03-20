import { Response } from 'express';
import { salesDashboardService, crafterDashboardService, adminDashboardService } from '../services/dashboard.service.js';
import { Customer } from '../models/Customer.js';
import { followupRepository } from '../repositories/followup.repository.js';
import { StaffRequest } from '../middleware/staffAuth.middleware.js';
import mongoose from 'mongoose';

export const dashboardController = {
  async getPriorityTasks(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const { data, total } = await salesDashboardService.getPriorityTasks(id, req.query);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      return res.status(200).json({
        status: true,
        data,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) }
      });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async fixFollowups(req: StaffRequest, res: Response) {
    try {
      const convertedCustomers = await Customer.find({ status: 'converted' }).lean();

      let updatedCount = 0;
      for (const customer of convertedCustomers) {
        const customerId = (customer._id as mongoose.Types.ObjectId).toString();
        await followupRepository.markPendingAsDone(customerId, 'Auto-cleaned up: Customer already converted');
        updatedCount++;
      }
      return res.status(200).json({ status: true, message: `Completed followups for ${updatedCount} converted customers` });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async replyToPriorityNote(req: StaffRequest, res: Response) {
    try {
      const { reply } = req.body;
      const data = await salesDashboardService.replyToPriorityNote(req.params.customerId, reply);
      return res.status(200).json({ status: true, data, message: "Reply sent" });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async sendPriorityMessage(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ status: false, error: 'Content is required' });
      const data = await salesDashboardService.sendPriorityMessage(req.params.customerId, id, content.trim());
      return res.status(200).json({ status: true, data, message: 'Message sent' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async markPriorityTaskSeen(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      await salesDashboardService.markTaskSeen(req.params.customerId, id);
      return res.status(200).json({ status: true, message: 'Marked as seen' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getSalesDashboard(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const data = await salesDashboardService.getSummary(id);
      return res.status(200).json({ status: true, data });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getCrafterDashboard(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const data = await crafterDashboardService.getSummary(id);
      return res.status(200).json({ status: true, data });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getAdminSalesTracking(req: StaffRequest, res: Response) {
    try {
      const data = await adminDashboardService.getSalesTracking();
      return res.status(200).json({ status: true, data });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getAdminCrafterTracking(req: StaffRequest, res: Response) {
    try {
      const data = await adminDashboardService.getCrafterTracking();
      return res.status(200).json({ status: true, data });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getAdminSalespersonDetails(req: StaffRequest, res: Response) {
    try {
      const data = await adminDashboardService.getSalespersonDetails(req.params.id);
      return res.status(200).json({ status: true, data });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getAdminSalespersonCustomers(req: StaffRequest, res: Response) {
    try {
      const { data, total } = await adminDashboardService.getSalespersonCustomers(req.params.id, req.query);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      return res.status(200).json({
        status: true,
        data,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) }
      });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async setAdminCustomerPriority(req: StaffRequest, res: Response) {
    try {
      const { isPriority, note } = req.body;
      const { id: adminId } = req.staffUser!;
      const data = await adminDashboardService.setCustomerPriority(req.params.customerId, isPriority, note, adminId);
      return res.status(200).json({ status: true, data });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async sendAdminPriorityMessage(req: StaffRequest, res: Response) {
    try {
      const { id: adminId } = req.staffUser!;
      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ status: false, error: 'Content is required' });
      const data = await adminDashboardService.sendAdminPriorityMessage(req.params.customerId, adminId, content.trim());
      return res.status(200).json({ status: true, data, message: 'Message sent' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async markAdminPriorityTaskSeen(req: StaffRequest, res: Response) {
    try {
      await adminDashboardService.markAdminTaskSeen(req.params.customerId);
      return res.status(200).json({ status: true, message: 'Marked as seen' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getAdminCrafterDetails(req: StaffRequest, res: Response) {
    try {
      const data = await adminDashboardService.getCrafterDetails(req.params.id);
      return res.status(200).json({ status: true, data });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },
};
