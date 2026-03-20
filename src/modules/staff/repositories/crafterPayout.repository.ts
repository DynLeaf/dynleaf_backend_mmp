import { CrafterPayout, ICrafterPayout, PayoutStatus } from '../models/CrafterPayout.js';
import mongoose from 'mongoose';

export const crafterPayoutRepository = {
  async findById(id: string): Promise<ICrafterPayout | null> {
    return CrafterPayout.findById(id)
      .populate('crafterId', 'name email')
      .populate('processedBy', 'name')
      .lean();
  },

  async findByCrafter(crafterId: string): Promise<ICrafterPayout[]> {
    return CrafterPayout.find({ crafterId })
      .populate('crafterId', 'name email')
      .sort({ createdAt: -1 })
      .lean();
  },

  async findAll(status?: PayoutStatus): Promise<ICrafterPayout[]> {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    return CrafterPayout.find(filter)
      .populate('crafterId', 'name email')
      .sort({ createdAt: -1 })
      .lean();
  },

  async findPending(): Promise<ICrafterPayout[]> {
    return CrafterPayout.find({ status: 'pending' })
      .populate('crafterId', 'name email')
      .lean();
  },

  async create(data: Partial<ICrafterPayout>): Promise<ICrafterPayout> {
    const payout = new CrafterPayout(data);
    return payout.save();
  },

  async markPaid(id: string, note: string, processedBy: string): Promise<ICrafterPayout | null> {
    return CrafterPayout.findByIdAndUpdate(
      id,
      {
        status: 'paid',
        note,
        paidAt: new Date(),
        processedBy: new mongoose.Types.ObjectId(processedBy),
      },
      { new: true }
    )
      .populate('crafterId', 'name email')
      .lean();
  },

  async sumPendingByCrafter(crafterId: string): Promise<number> {
    const result = await CrafterPayout.aggregate([
      { $match: { crafterId: new mongoose.Types.ObjectId(crafterId), status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    return result[0]?.total ?? 0;
  },
};
