import { Request, Response } from 'express';
import { salesDashboardService, crafterDashboardService, adminDashboardService } from '../services/dashboard.service.js';

export const dashboardController = {
  async getPriorityTasks(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const { data, total } = await salesDashboardService.getPriorityTasks(id, req.query);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      return res.status(200).json({
        status: true,
        data,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) }
      });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async replyToPriorityNote(req: Request, res: Response) {
    try {
      const { reply } = req.body;
      const data = await salesDashboardService.replyToPriorityNote(req.params.customerId, reply);
      return res.status(200).json({ status: true, data, message: "Reply sent" });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },
  async getSalesDashboard(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const data = await salesDashboardService.getSummary(id);
      return res.status(200).json({ status: true, data });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getCrafterDashboard(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const data = await crafterDashboardService.getSummary(id);
      return res.status(200).json({ status: true, data });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getAdminSalesTracking(req: Request, res: Response) {
    try {
      const data = await adminDashboardService.getSalesTracking();
      return res.status(200).json({ status: true, data });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getAdminCrafterTracking(req: Request, res: Response) {
    try {
      const data = await adminDashboardService.getCrafterTracking();
      return res.status(200).json({ status: true, data });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },
  async getAdminSalespersonDetails(req: Request, res: Response) {
    try {
      const data = await adminDashboardService.getSalespersonDetails(req.params.id);
      return res.status(200).json({ status: true, data });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getAdminSalespersonCustomers(req: Request, res: Response) {
    try {
      const { data, total } = await adminDashboardService.getSalespersonCustomers(req.params.id, req.query);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      return res.status(200).json({ 
        status: true, 
        data, 
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async setAdminCustomerPriority(req: Request, res: Response) {
    try {
      const { isPriority, note } = req.body;
      const data = await adminDashboardService.setCustomerPriority(req.params.customerId, isPriority, note);
      return res.status(200).json({ status: true, data });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getAdminCrafterDetails(req: Request, res: Response) {
    try {
      const data = await adminDashboardService.getCrafterDetails(req.params.id);
      return res.status(200).json({ status: true, data });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },
};
