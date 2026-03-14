import mongoose from 'mongoose';
import { CrafterEarning, ICrafterEarning, EarningAction } from '../models/CrafterEarning.js';

export const crafterEarningRepository = {
  async findById(id: string): Promise<ICrafterEarning | null> {
    return CrafterEarning.findById(id).lean();
  },

  async findByCrafter(crafterId: string): Promise<ICrafterEarning[]> {
    return CrafterEarning.find({ crafterId })
      .populate('orderId', 'productType quantity designType')
      .sort({ createdAt: -1 })
      .lean();
  },

  async findAll(filter: any = {}): Promise<ICrafterEarning[]> {
    return CrafterEarning.find(filter)
      .populate('orderId', 'productType quantity designType')
      .populate('crafterId', 'name')
      .sort({ createdAt: -1 })
      .lean();
  },

  async findByOrder(orderId: string): Promise<ICrafterEarning[]> {
    return CrafterEarning.find({ orderId }).lean();
  },

  async create(data: Partial<ICrafterEarning>): Promise<ICrafterEarning> {
    const earning = new CrafterEarning(data);
    return earning.save();
  },

  async sumByCrafter(crafterId: string): Promise<number> {
    const result = await CrafterEarning.aggregate([
      { $match: { crafterId: new mongoose.Types.ObjectId(crafterId) } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return result[0]?.total ?? 0;
  },

  async sumByPeriod(crafterId: string, from: Date, to: Date): Promise<number> {
    const result = await CrafterEarning.aggregate([
      {
        $match: {
          crafterId: new mongoose.Types.ObjectId(crafterId),
          createdAt: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return result[0]?.total ?? 0;
  },

  async sumUnpaidByCrafter(crafterId: string, paidEarningIds: string[]): Promise<number> {
    const paidIds = paidEarningIds.map((id) => new mongoose.Types.ObjectId(id));
    const result = await CrafterEarning.aggregate([
      {
        $match: {
          crafterId: new mongoose.Types.ObjectId(crafterId),
          _id: { $nin: paidIds },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return result[0]?.total ?? 0;
  },

  async updateManyStatus(ids: string[], status: 'pending' | 'paid'): Promise<void> {
    await CrafterEarning.updateMany(
      { _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } },
      { $set: { status } }
    );
  },

  async deleteByOrderAction(orderId: string, action: EarningAction): Promise<void> {
    await CrafterEarning.deleteMany({ 
      orderId: new mongoose.Types.ObjectId(orderId), 
      action,
      status: 'pending' // Only delete if pending
    });
  },

  async deleteByOrder(orderId: string): Promise<void> {
    await CrafterEarning.deleteMany({ 
      orderId: new mongoose.Types.ObjectId(orderId),
      status: 'pending'
    });
  },
};
