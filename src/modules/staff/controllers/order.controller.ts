import { Response } from 'express';
import { orderService } from '../services/order.service.js';
import { StaffRequest } from '../middleware/staffAuth.middleware.js';

interface OrderQueryOptions {
  status?: string;
  sortBy?: string;
  sortOrder?: string;
  page: number;
  limit: number;
  customerId?: string;
  salespersonId?: string;
  crafterId?: string;
}

export const orderController = {
  async getAll(req: StaffRequest, res: Response) {
    try {
      const requester = req.staffUser!;
      const { status, sortBy, sortOrder, page, limit, customerId } = req.query as Record<string, string>;
      const opts: OrderQueryOptions = {
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
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getPending(req: StaffRequest, res: Response) {
    try {
      const orders = await orderService.getPendingOrders();
      return res.status(200).json({ status: true, data: orders });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async getById(req: StaffRequest, res: Response) {
    try {
      const order = await orderService.getById(req.params.id);
      return res.status(200).json({ status: true, data: order });
    } catch (err: unknown) {
      return res.status(404).json({ status: false, error: (err as Error).message });
    }
  },

  async create(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const order = await orderService.create({ ...req.body, salespersonId: id });
      return res.status(201).json({ status: true, data: order, message: 'Order created' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async accept(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const order = await orderService.accept(req.params.id, id);
      return res.status(200).json({ status: true, data: order, message: 'Order accepted' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async reject(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const { reason } = req.body;
      const order = await orderService.reject(req.params.id, id, reason);
      return res.status(200).json({ status: true, data: order, message: 'Order rejected' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async updateStatus(req: StaffRequest, res: Response) {
    try {
      const requester = req.staffUser!;
      const { status, crafterNotes } = req.body;
      const order = await orderService.updateWorkflowStatus(req.params.id, requester.id, status, crafterNotes);
      return res.status(200).json({ status: true, data: order });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async resubmit(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const order = await orderService.resubmit(req.params.id, id, req.body);
      return res.status(200).json({ status: true, data: order, message: 'Order resubmitted' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async addSalesNote(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const { note } = req.body;
      const order = await orderService.addSalesNote(req.params.id, id, note);
      return res.status(200).json({ status: true, data: order, message: 'Note added to order' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async addCrafterNote(req: StaffRequest, res: Response) {
    try {
      const { id } = req.staffUser!;
      const { note } = req.body;
      const order = await orderService.addCrafterNote(req.params.id, id, note);
      return res.status(200).json({ status: true, data: order, message: 'Reply added to order' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },
};
