import { crafterEarningRepository } from '../repositories/crafterEarning.repository.js';
import { crafterPayoutRepository } from '../repositories/crafterPayout.repository.js';
import { ICrafterEarning } from '../models/CrafterEarning.js';
import { ICrafterPayout } from '../models/CrafterPayout.js';

export const earningsService = {
  async getEarningsByCrafter(crafterId: string): Promise<ICrafterEarning[]> {
    return crafterEarningRepository.findByCrafter(crafterId);
  },

  async getAllEarnings(filter: any = {}): Promise<ICrafterEarning[]> {
    return crafterEarningRepository.findAll(filter);
  },

  async updateEarningsStatus(ids: string[], status: 'pending' | 'paid'): Promise<void> {
    return crafterEarningRepository.updateManyStatus(ids, status);
  },

  async getDailySummary(crafterId: string): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return crafterEarningRepository.sumByPeriod(crafterId, start, end);
  },

  async getWeeklySummary(crafterId: string): Promise<number> {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    return crafterEarningRepository.sumByPeriod(crafterId, start, end);
  },

  async getMonthlySummary(crafterId: string): Promise<number> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date();
    return crafterEarningRepository.sumByPeriod(crafterId, start, end);
  },

  async getEarningsSummary(crafterId: string): Promise<{
    daily: number;
    weekly: number;
    monthly: number;
    total: number;
  }> {
    const [daily, weekly, monthly, total] = await Promise.all([
      this.getDailySummary(crafterId),
      this.getWeeklySummary(crafterId),
      this.getMonthlySummary(crafterId),
      crafterEarningRepository.sumByCrafter(crafterId),
    ]);
    return { daily, weekly, monthly, total };
  },

  // Payouts
  async getPayoutsByCrafter(crafterId: string): Promise<ICrafterPayout[]> {
    return crafterPayoutRepository.findByCrafter(crafterId);
  },

  async getAllPayouts(status?: 'pending' | 'paid'): Promise<ICrafterPayout[]> {
    return crafterPayoutRepository.findAll(status);
  },

  async getPendingPayouts(): Promise<ICrafterPayout[]> {
    return crafterPayoutRepository.findPending();
  },

  async createPayout(data: {
    crafterId: string;
    totalAmount: number;
    ordersIncluded: string[];
    earningsIncluded: string[];
  }): Promise<ICrafterPayout> {
    if (!data.crafterId) throw new Error('Crafter ID is required');
    if (!data.totalAmount || data.totalAmount <= 0) throw new Error('Total amount must be positive');

    return crafterPayoutRepository.create({
      crafterId: data.crafterId as any,
      totalAmount: data.totalAmount,
      ordersIncluded: data.ordersIncluded as any[],
      earningsIncluded: data.earningsIncluded as any[],
      status: 'pending',
    });
  },

  async markPayoutPaid(id: string, note: string, adminId: string): Promise<ICrafterPayout> {
    const payout = await crafterPayoutRepository.findById(id);
    if (!payout) throw new Error('Payout not found');
    if (payout.status === 'paid') throw new Error('Payout already marked as paid');

    const updated = await crafterPayoutRepository.markPaid(id, note, adminId);
    if (!updated) throw new Error('Payout not found');

    // Also mark associated earnings as paid
    if (updated.earningsIncluded && updated.earningsIncluded.length > 0) {
      await crafterEarningRepository.updateManyStatus(
        updated.earningsIncluded.map(id => id.toString()), 
        'paid'
      );
    }

    return updated;
  },
};
