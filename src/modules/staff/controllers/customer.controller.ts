import { Request, Response } from 'express';
import { customerService } from '../services/customer.service.js';

export const customerController = {
  async getAll(req: Request, res: Response) {
    try {
      const requester = (req as any).staffUser;
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
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const customer = await customerService.getById(req.params.id);
      return res.status(200).json({ status: true, data: customer });
    } catch (err: any) {
      return res.status(404).json({ status: false, error: err.message });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const requester = (req as any).staffUser;
      const customer = await customerService.create({ ...req.body, createdBy: requester.id });
      return res.status(201).json({ status: true, data: customer, message: 'Customer created' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const customer = await customerService.update(req.params.id, req.body);
      return res.status(200).json({ status: true, data: customer });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async markConverted(req: Request, res: Response) {
    try {
      const customer = await customerService.markConverted(req.params.id);
      return res.status(200).json({ status: true, data: customer, message: 'Customer marked as converted' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },

  async markCancelled(req: Request, res: Response) {
    try {
      const customer = await customerService.markCancelled(req.params.id);
      return res.status(200).json({ status: true, data: customer, message: 'Customer marked as cancelled' });
    } catch (err: any) {
      return res.status(400).json({ status: false, error: err.message });
    }
  },
};
