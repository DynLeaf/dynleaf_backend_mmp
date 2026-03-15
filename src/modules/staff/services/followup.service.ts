import { followupRepository } from '../repositories/followup.repository.js';
import { IFollowup, FollowupStatus, IFollowupEvent } from '../models/Followup.js';

export const followupService = {
  async getByCustomer(customerId: string): Promise<IFollowup[]> {
    return followupRepository.findByCustomer(customerId);
  },

  async getBySalesperson(salespersonId: string, status?: FollowupStatus): Promise<IFollowup[]> {
    return followupRepository.findBySalesperson(salespersonId, status);
  },

  async getById(id: string): Promise<IFollowup> {
    const followup = await followupRepository.findById(id);
    if (!followup) throw new Error('Followup not found');
    return followup;
  },

  async getTodayBySalesperson(salespersonId: string): Promise<IFollowup[]> {
    return followupRepository.findTodayBySalesperson(salespersonId);
  },

  async getMissed(salespersonId: string): Promise<IFollowup[]> {
    return followupRepository.findMissed(salespersonId);
  },

  async getUpcoming(salespersonId: string): Promise<IFollowup[]> {
    return followupRepository.findUpcoming(salespersonId);
  },

  async create(data: {
    customerId: string;
    salespersonId: string;
    followupDate: Date;
    followupTime: string;
    message?: string;
  }): Promise<IFollowup> {
    if (!data.customerId) throw new Error('Customer ID is required');
    if (!data.followupDate) throw new Error('Followup date is required');
    if (!data.followupTime) throw new Error('Followup time is required');

    const initialHistory: IFollowupEvent = {
      message: data.message || '',
      status: 'pending',
      followupDate: data.followupDate,
      followupTime: data.followupTime,
      recordedAt: new Date(),
    };

    return followupRepository.create({
      ...data,
      followupDate: new Date(data.followupDate),
      history: [initialHistory],
      status: 'pending',
    });
  },

  async reschedule(
    id: string,
    data: { followupDate: Date; followupTime: string; message?: string }
  ): Promise<IFollowup> {
    const existing = await followupRepository.findById(id);
    if (!existing) throw new Error('Followup not found');

    const historyEntry: IFollowupEvent = {
      message: data.message || 'Rescheduled',
      status: 'rescheduled',
      followupDate: new Date(data.followupDate),
      followupTime: data.followupTime,
      recordedAt: new Date(),
    };

    const updated = await followupRepository.updateById(id, {
      followupDate: new Date(data.followupDate),
      followupTime: data.followupTime,
      message: data.message || existing.message,
      status: 'pending',
      history: [...(existing.history || []), historyEntry],
    } as any);

    if (!updated) throw new Error('Followup not found');
    return updated;
  },

  async addNote(id: string, message: string): Promise<IFollowup> {
    const existing = await followupRepository.findById(id);
    if (!existing) throw new Error('Followup not found');

    const historyEntry: IFollowupEvent = {
      message,
      status: existing.status,
      followupDate: existing.followupDate,
      followupTime: existing.followupTime,
      recordedAt: new Date(),
    };

    const updated = await followupRepository.updateById(id, {
      message,
      history: [...(existing.history || []), historyEntry],
    } as any);

    if (!updated) throw new Error('Followup not found');
    return updated;
  },

  async markDone(id: string, message?: string): Promise<IFollowup> {
    const existing = await followupRepository.findById(id);
    if (!existing) throw new Error('Followup not found');

    const historyEntry: IFollowupEvent = {
      message: message || 'Marked as done',
      status: 'done',
      followupDate: existing.followupDate,
      followupTime: existing.followupTime,
      recordedAt: new Date(),
    };

    const updated = await followupRepository.updateById(id, {
      status: 'done',
      message: message || existing.message,
      history: [...(existing.history || []), historyEntry],
    } as any);

    if (!updated) throw new Error('Followup not found');
    return updated;
  },

  async getPaginated(opts: {
    salespersonId: string;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: IFollowup[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(opts.limit) || 20));
    const { data, total } = await followupRepository.findPaginated({
      salespersonId: opts.salespersonId,
      status: opts.status as FollowupStatus,
      sortBy: opts.sortBy,
      sortOrder: opts.sortOrder as 'asc' | 'desc',
      page,
      limit,
    });
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } };
  },
};
