import { customerRepository } from '../repositories/customer.repository.js';
import { ICustomer, CustomerStatus } from '../models/Customer.js';

export const customerService = {
  async getAll(): Promise<ICustomer[]> {
    return customerRepository.findAll();
  },

  async getBySalesperson(salespersonId: string): Promise<ICustomer[]> {
    return customerRepository.findByCreatedBy(salespersonId);
  },

  async getById(id: string): Promise<ICustomer> {
    const customer = await customerRepository.findById(id);
    if (!customer) throw new Error('Customer not found');
    return customer;
  },

  async create(data: {
    name: string;
    instagramId?: string;
    mobile?: string;
    note?: string;
    followupRequired?: boolean;
    followupDate?: Date;
    followupTime?: string;
    createdBy: string;
  }): Promise<ICustomer> {
    if (!data.name?.trim()) throw new Error('Customer name is required');
    if (!data.instagramId?.trim() && !data.mobile?.trim()) {
      throw new Error('At least one contact method (Instagram ID or mobile) is required');
    }
    if (data.followupRequired && !data.followupDate) {
      throw new Error('Followup date is required when followup is enabled');
    }
    if (data.followupRequired && !data.followupTime) {
      throw new Error('Followup time is required when followup is enabled');
    }

    return customerRepository.create(data);
  },

  async update(id: string, data: Partial<ICustomer>): Promise<ICustomer> {
    if (data.instagramId !== undefined || data.mobile !== undefined) {
      const existing = await customerRepository.findById(id);
      if (!existing) throw new Error('Customer not found');
      const instagram = data.instagramId ?? existing.instagramId;
      const mobile = data.mobile ?? existing.mobile;
      if (!instagram?.trim() && !mobile?.trim()) {
        throw new Error('At least one contact method is required');
      }
    }
    const customer = await customerRepository.updateById(id, data);
    if (!customer) throw new Error('Customer not found');
    return customer;
  },

  async markConverted(id: string): Promise<ICustomer> {
    const customer = await customerRepository.updateStatus(id, 'converted');
    if (!customer) throw new Error('Customer not found');
    return customer;
  },

  async markCancelled(id: string): Promise<ICustomer> {
    const customer = await customerRepository.updateStatus(id, 'cancelled');
    if (!customer) throw new Error('Customer not found');
    return customer;
  },

  async getPaginated(opts: {
    salespersonId?: string;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: ICustomer[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(opts.limit) || 20));
    const { data, total } = await customerRepository.findPaginated({
      salespersonId: opts.salespersonId,
      search: opts.search,
      tab: opts.status as 'all' | 'followup' | 'missed' | 'converted' | 'cancelled' | undefined,
      sortBy: opts.sortBy,
      sortOrder: opts.sortOrder as 'asc' | 'desc',
      page,
      limit,
    });
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } };
  },
};
