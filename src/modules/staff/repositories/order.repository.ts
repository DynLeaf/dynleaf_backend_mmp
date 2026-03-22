import { Order, IOrder, OrderStatus } from '../models/Order.js';
import mongoose from 'mongoose';

export const orderRepository = {
  async findById(id: string): Promise<IOrder | null> {
    return Order.findById(id)
      .populate('customerId', 'name instagramId mobile')
      .populate('salespersonId', 'name email')
      .populate('crafterId', 'name email')
      .lean();
  },

  async findByCustomer(customerId: string): Promise<IOrder[]> {
    return Order.find({ customerId }).sort({ createdAt: -1 }).lean();
  },

  async findBySalesperson(salespersonId: string, status?: OrderStatus): Promise<IOrder[]> {
    const filter: Record<string, unknown> = { salespersonId };
    if (status) filter.status = status;
    return Order.find(filter)
      .populate('customerId', 'name')
      .populate('crafterId', 'name')
      .sort({ createdAt: -1 })
      .lean();
  },

  async findByCrafter(crafterId: string, status?: OrderStatus): Promise<IOrder[]> {
    const filter: Record<string, unknown> = { crafterId };
    if (status) filter.status = status;
    return Order.find(filter)
      .populate('customerId', 'name')
      .populate('salespersonId', 'name')
      .sort({ createdAt: -1 })
      .lean();
  },

  async findPendingOrders(): Promise<IOrder[]> {
    return Order.find({ status: 'pending' })
      .populate('customerId', 'name')
      .populate('salespersonId', 'name')
      .sort({ priority: -1, createdAt: 1 })
      .lean();
  },

  async findAll(filter: Partial<{ status: OrderStatus; salespersonId: string; crafterId: string }> = {}): Promise<IOrder[]> {
    return Order.find(filter)
      .populate('customerId', 'name')
      .populate('salespersonId', 'name email')
      .populate('crafterId', 'name email')
      .sort({ createdAt: -1 })
      .lean();
  },

  async create(data: Partial<IOrder>): Promise<IOrder> {
    const status = data.status || 'pending';
    const order = new Order({
      ...data,
      statusHistory: [{
        status,
        changedAt: new Date(),
        note: data.notes || data.crafterNotes || data.rejectionReason || data.salesAdditionalNotes || 'Order created',
      }]
    });
    return order.save();
  },

  async updateStatus(id: string, status: OrderStatus, extra?: Partial<IOrder>): Promise<IOrder | null> {
    const updatePayload: mongoose.UpdateQuery<IOrder> = {
      $set: { status, ...extra },
      $push: {
        statusHistory: {
          status: status,
          changedAt: new Date(),
          note: extra?.notes || extra?.crafterNotes || extra?.rejectionReason || extra?.salesAdditionalNotes || '',
        }
      } as any
    };
    return Order.findByIdAndUpdate(id, updatePayload, { new: true }).lean();
  },

  async updateById(id: string, data: Partial<IOrder>): Promise<IOrder | null> {
    if (data.status) {
      const updatePayload: mongoose.UpdateQuery<IOrder> = {
        $set: data,
        $push: {
          statusHistory: {
            status: data.status,
            changedAt: new Date(),
            note: data.notes || data.crafterNotes || data.rejectionReason || data.salesAdditionalNotes || '',
          }
        } as any
      };
      return Order.findByIdAndUpdate(id, updatePayload, { new: true, runValidators: true }).lean();
    }
    return Order.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
  },

  async countBySalesperson(salespersonId: string, status?: OrderStatus): Promise<number> {
    const filter: Record<string, unknown> = { salespersonId };
    if (status) filter.status = status;
    return Order.countDocuments(filter);
  },

  async countByCrafter(crafterId: string, status?: OrderStatus): Promise<number> {
    const filter: Record<string, unknown> = { crafterId };
    if (status) filter.status = status;
    return Order.countDocuments(filter);
  },

  async findPaginated(opts: {
    salespersonId?: string;
    crafterId?: string;
    customerId?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page: number;
    limit: number;
  }): Promise<{ data: IOrder[]; total: number }> {
    const { salespersonId, crafterId, customerId, status, sortBy = 'createdAt', sortOrder = 'desc', page, limit } = opts;
    const filter: Record<string, unknown> = {};
    if (salespersonId) filter.salespersonId = salespersonId;
    if (crafterId) filter.crafterId = crafterId;
    if (customerId) filter.customerId = customerId;
    const ACTIVE = ['accepted', 'printed', 'poured', 'sticker'];
    if (status === 'active') filter.status = { $in: ACTIVE };
    else if (status && status !== 'all') filter.status = status;
    const allowed = ['createdAt', 'expectedDeliveryDate', 'updatedAt'];
    const field = allowed.includes(sortBy) ? sortBy : 'createdAt';
    const sort: Record<string, 1 | -1> = { [field]: sortOrder === 'asc' ? 1 : -1 };
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Order.find(filter)
        .populate('customerId', 'name')
        .populate('salespersonId', 'name email')
        .populate('crafterId', 'name email')
        .sort(sort).skip(skip).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);
    return { data: data as IOrder[], total };
  },
};
