import { customerRepository } from '../repositories/customer.repository.js';
import { followupRepository } from '../repositories/followup.repository.js';
import { ICustomer, CustomerStatus } from '../models/Customer.js';
import { IFollowupEvent } from '../models/Followup.js';

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

    const customer = await customerRepository.create(data);

    // ─── Auto-create a StaffFollowup document when followup is scheduled ───────
    if (data.followupRequired && data.followupDate && data.followupTime) {
      const initialHistory: IFollowupEvent = {
        message: 'Followup created with customer',
        status: 'pending',
        followupDate: new Date(data.followupDate),
        followupTime: data.followupTime,
        recordedAt: new Date(),
      };
      await followupRepository.create({
        customerId: (customer as any)._id,
        salespersonId: data.createdBy,
        followupDate: new Date(data.followupDate),
        followupTime: data.followupTime,
        message: 'Followup created with customer',
        status: 'pending',
        history: [initialHistory],
      });
    }

    return customer;
  },

  async update(id: string, data: Partial<ICustomer> & { createdBy?: string }): Promise<ICustomer> {
    if (data.instagramId !== undefined || data.mobile !== undefined) {
      const existing = await customerRepository.findById(id);
      if (!existing) throw new Error('Customer not found');
      const instagram = data.instagramId ?? existing.instagramId;
      const mobile = data.mobile ?? existing.mobile;
      if (!instagram?.trim() && !mobile?.trim()) {
        throw new Error('At least one contact method is required');
      }
    }

    const existing = await customerRepository.findById(id);
    if (!existing) throw new Error('Customer not found');

    // Extract createdBy (used only for followup sync — NOT for database update)
    const { createdBy: syncedSpId, ...updateData } = data;
    const salespersonId = syncedSpId || (existing.createdBy as any)?._id?.toString() || (existing.createdBy as any).toString();

    const customer = await customerRepository.updateById(id, updateData);
    if (!customer) throw new Error('Customer not found');

    // ─── Sync followup: if followupDate/Time changed, update the StaffFollowup ─
    const followupDateChanged = data.followupDate !== undefined;
    const followupTimeChanged = data.followupTime !== undefined;
    const followupNowRequired =
      data.followupRequired !== undefined ? data.followupRequired : existing.followupRequired;

    if (followupNowRequired && (followupDateChanged || followupTimeChanged)) {
      const newDate = updateData.followupDate ? new Date(updateData.followupDate) : existing.followupDate!;
      const newTime = updateData.followupTime ?? existing.followupTime!;

      if (salespersonId && newDate && newTime) {
        await customerService._syncFollowup(id, salespersonId, newDate, newTime, 'Rescheduled via customer update');
      }
    }

    return customer;
  },

  /**
   * Internal helper: find the latest pending follow-up for a customer and
   * reschedule it (adding a history entry). Creates one if none exists.
   */
  async _syncFollowup(
    customerId: string,
    salespersonId: string,
    newDate: Date,
    newTime: string,
    message: string
  ): Promise<void> {
    const { Followup } = await import('../models/Followup.js');
    const existing = await Followup.findOne({ customerId, salespersonId, status: 'pending' })
      .sort({ updatedAt: -1 })
      .lean();

    if (existing) {
      const historyEntry: IFollowupEvent = {
        message,
        status: 'rescheduled',
        followupDate: newDate,
        followupTime: newTime,
        recordedAt: new Date(),
      };
      await followupRepository.updateById((existing as any)._id.toString(), {
        followupDate: newDate,
        followupTime: newTime,
        message,
        status: 'pending',
        history: [...(existing.history || []), historyEntry],
      } as any);
    } else {
      // No pending followup found — create a fresh one
      const initialHistory: IFollowupEvent = {
        message,
        status: 'pending',
        followupDate: newDate,
        followupTime: newTime,
        recordedAt: new Date(),
      };
      await followupRepository.create({
        customerId,
        salespersonId,
        followupDate: newDate,
        followupTime: newTime,
        message,
        status: 'pending',
        history: [initialHistory],
      });
    }
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
