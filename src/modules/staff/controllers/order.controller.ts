import { Request, Response } from 'express';
import { orderService } from '../services/order.service.js';

export const orderController = {
  async getAll(req: Request, res: Response) {
    try {
      const requester = (req as any).staffUser;
      const { status, sortBy, sortOrder, page, limit, customerId } = req.query as Record<string, string>;
      const opts: any = {
        status,
        sortBy,
        sortOrder,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        customerId,
      };
      if (requester.role === 'salesman') opts.salespersonId = requester.id;
      else if (requester.role === 'crafter') opts.crafterId = requester.id;
      else if (requester.role === 'admin') {
        const { salespersonId, crafterId: qCrafterId } = req.query as Record<string, string>;
        if (salespersonId) opts.salespersonId = salespersonId;
        if (qCrafterId) opts.crafterId = qCrafterId;
      }
      const result = await orderService.getPaginated(opts);
      return res.status(200).json({ status: true, data: result.data, pagination: result.pagination });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getPending(req: Request, res: Response) {
    try {
      const orders = await orderService.getPendingOrders();
      return res.status(200).json({ status: true, data: orders });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const order = await orderService.getById(req.params.id);
      return res.status(200).json({ status: true, data: order });
    } catch (err: any) {
      return res.status(404).json({ status: false, error: err.message });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const order = await orderService.create({ ...req.body, salespersonId: id });
      return res.status(201).json({ status: true, data: order, message: 'Order created' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async accept(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const order = await orderService.accept(req.params.id, id);
      return res.status(200).json({ status: true, data: order, message: 'Order accepted' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async reject(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const { reason } = req.body;
      const order = await orderService.reject(req.params.id, id, reason);
      return res.status(200).json({ status: true, data: order, message: 'Order rejected' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async updateStatus(req: Request, res: Response) {
    try {
      const requester = (req as any).staffUser;
      const { status, crafterNotes } = req.body;
      const order = await orderService.updateWorkflowStatus(req.params.id, requester.id, status, crafterNotes);
      return res.status(200).json({ status: true, data: order });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async resubmit(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const order = await orderService.resubmit(req.params.id, id, req.body);
      return res.status(200).json({ status: true, data: order, message: 'Order resubmitted' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async addSalesNote(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const { note } = req.body;
      const order = await orderService.addSalesNote(req.params.id, id, note);
      return res.status(200).json({ status: true, data: order, message: 'Note added to order' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async addCrafterNote(req: Request, res: Response) {
    try {
      const { id } = (req as any).staffUser;
      const { note } = req.body;
      const order = await orderService.addCrafterNote(req.params.id, id, note);
      return res.status(200).json({ status: true, data: order, message: 'Reply added to order' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },
};
