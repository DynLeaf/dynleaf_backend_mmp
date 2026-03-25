import { Response } from 'express';
import { customerService } from '../services/customer.service.js';
import { StaffRequest } from '../middleware/staffAuth.middleware.js';

export const customerController = {
  async getAll(req: StaffRequest, res: Response) {
    try {
      const requester = req.staffUser!;
      const { search, status, sortBy, sortOrder, page, limit } = req.query as Record<string, string>;
      const result = await customerService.getPaginated({
        salespersonId: requester.role === 'salesman' ? requester.id : undefined,
        search,
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

  async getById(req: StaffRequest, res: Response) {
    try {
      const customer = await customerService.getById(req.params.id);
      return res.status(200).json({ status: true, data: customer });
    } catch (err: unknown) {
      return res.status(404).json({ status: false, error: (err as Error).message });
    }
  },

  async create(req: StaffRequest, res: Response) {
    try {
      const requester = req.staffUser!;
      const customer = await customerService.create({ ...req.body, createdBy: requester.id });
      return res.status(201).json({ status: true, data: customer, message: 'Customer created' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async update(req: StaffRequest, res: Response) {
    try {
      const requester = req.staffUser!;
      // Pass createdBy so the service can sync the StaffFollowup on reschedule
      const customer = await customerService.update(req.params.id, {
        ...req.body,
        createdBy: requester.id,
      });
      return res.status(200).json({ status: true, data: customer });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async markConverted(req: StaffRequest, res: Response) {
    try {
      const customer = await customerService.markConverted(req.params.id);
      return res.status(200).json({ status: true, data: customer, message: 'Customer marked as converted' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async markCancelled(req: StaffRequest, res: Response) {
    try {
      const customer = await customerService.markCancelled(req.params.id);
      return res.status(200).json({ status: true, data: customer, message: 'Customer marked as cancelled' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },

  async markActive(req: StaffRequest, res: Response) {
    try {
      const customer = await customerService.markActive(req.params.id);
      return res.status(200).json({ status: true, data: customer, message: 'Customer marked as active' });
    } catch (err: unknown) {
      return res.status(400).json({ status: false, error: (err as Error).message });
    }
  },
};
