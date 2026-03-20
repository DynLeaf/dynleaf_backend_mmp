import { Customer, ICustomer, CustomerStatus } from '../models/Customer.js';
import mongoose, { Types } from 'mongoose';
import { Order } from '../models/Order.js';

export const customerRepository = {
  async findById(id: string): Promise<ICustomer | null> {
    return Customer.findById(id).populate('createdBy', 'name email').lean();
  },

  async findByCreatedBy(salespersonId: string): Promise<ICustomer[]> {
    return Customer.find({ createdBy: salespersonId }).sort({ createdAt: -1 }).lean();
  },

  async findAll(): Promise<ICustomer[]> {
    return Customer.find().populate('createdBy', 'name email').sort({ createdAt: -1 }).lean();
  },

  async findWithFollowupToday(salespersonId?: string): Promise<ICustomer[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const filter: any = {
      followupRequired: true,
      followupDate: { $gte: start, $lte: end },
    };
    if (salespersonId) filter.createdBy = salespersonId;

    return Customer.find(filter).lean();
  },

  async findMissedFollowups(salespersonId?: string): Promise<ICustomer[]> {
    const now = new Date();
    const filter: any = {
      followupRequired: true,
      status: 'active',
      followupDate: { $lt: now },
    };
    if (salespersonId) filter.createdBy = salespersonId;
    return Customer.find(filter).lean();
  },

  async findUpcomingFollowups(salespersonId?: string): Promise<ICustomer[]> {
    const now = new Date();
    const filter: any = {
      followupRequired: true,
      status: 'active',
      followupDate: { $gt: now },
    };
    if (salespersonId) filter.createdBy = salespersonId;
    return Customer.find(filter).sort({ followupDate: 1 }).lean();
  },

  async create(data: Record<string, any>): Promise<ICustomer> {
    const customer = new Customer(data);
    const saved = await customer.save();
    return Customer.findById(saved._id).lean() as Promise<ICustomer>;
  },

  async updateById(id: string, data: Partial<ICustomer>): Promise<ICustomer | null> {
    return Customer.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
  },

  async updateStatus(id: string, status: CustomerStatus): Promise<ICustomer | null> {
    return Customer.findByIdAndUpdate(id, { status }, { new: true }).lean();
  },

  async countByCreatedBy(salespersonId: string): Promise<number> {
    return Customer.countDocuments({ createdBy: salespersonId });
  },

  async countByStatus(salespersonId: string, status: CustomerStatus): Promise<number> {
    return Customer.countDocuments({ createdBy: salespersonId, status });
  },

  async findPaginated(opts: {
    salespersonId?: string;
    search?: string;
    tab?: 'all' | 'followup' | 'missed' | 'converted' | 'cancelled' | 'active';
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page: number;
    limit: number;
  }): Promise<{ data: ICustomer[]; total: number }> {
    const { salespersonId, search, tab, sortBy = 'createdAt', sortOrder = 'desc', page, limit } = opts;
    const filter: any = {};
    if (salespersonId) filter.createdBy = new mongoose.Types.ObjectId(salespersonId);

    if (tab === 'converted') filter.status = 'converted';
    else if (tab === 'cancelled') filter.status = 'cancelled';
    else if (tab === 'active') filter.status = 'active';
    else if (tab === 'followup') {
      filter.status = 'active';
      filter.followupRequired = true;
      filter.followupDate = { $gte: new Date() };
    } else if (tab === 'missed') {
      filter.status = 'active';
      filter.followupRequired = true;
      filter.followupDate = { $lt: new Date() };
    }
    if (search?.trim()) {
      const esc = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ name: new RegExp(esc, 'i') }, { instagramId: new RegExp(esc, 'i') }, { mobile: new RegExp(esc, 'i') }];
    }
    const allowed = ['createdAt', 'name', 'followupDate', 'updatedAt'];
    const field = allowed.includes(sortBy) ? sortBy : 'createdAt';
    const sort: any = { [field]: sortOrder === 'asc' ? 1 : -1 };
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Customer.find(filter).populate('createdBy', 'name email').sort(sort).skip(skip).limit(limit).lean(),
      Customer.countDocuments(filter),
    ]);

    const customerIds = data.map(c => c._id);
    const orders = await Order.find({ customerId: { $in: customerIds } }).select('customerId').lean();
    const customersWithOrders = new Set(orders.map(o => o.customerId.toString()));

    const enrichedData = data.map(c => ({
      ...c,
      hasOrders: customersWithOrders.has(c._id.toString())
    }));

    return { data: enrichedData as unknown as ICustomer[], total };
  },

  async findPriorityBySalesperson(salespersonId: string): Promise<ICustomer[]> {
    return Customer.find({
      createdBy: salespersonId,
      isPriority: true,
      priorityMessages: { $elemMatch: { senderRole: 'admin', seenAt: null } }
    }).sort({ priorityLastMessageAt: -1, updatedAt: -1 }).lean();
  },

  async findPriorityPaginatedBySalesperson(salespersonId: string, page: number, limit: number): Promise<{ data: ICustomer[]; total: number }> {
    const filter = { createdBy: salespersonId, isPriority: true };
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Customer.find(filter).sort({ priorityLastMessageAt: -1, updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Customer.countDocuments(filter),
    ]);
    return { data: data as ICustomer[], total };
  },

  async addPriorityMessage(
    customerId: string,
    senderRole: 'admin' | 'salesperson',
    senderId: string,
    content: string
  ): Promise<ICustomer | null> {
    const now = new Date();
    return Customer.findByIdAndUpdate(
      customerId,
      {
        $push: { priorityMessages: { senderRole, senderId: new Types.ObjectId(senderId), content, seenAt: null, createdAt: now } },
        $set: { priorityLastMessageAt: now },
      },
      { new: true }
    ).lean();
  },

  async markPriorityMessagesSeen(
    customerId: string,
    viewerRole: 'admin' | 'salesperson'
  ): Promise<void> {
    await Customer.updateOne(
      { _id: customerId },
      { $set: { 'priorityMessages.$[msg].seenAt': new Date() } },
      { arrayFilters: [{ 'msg.senderRole': { $ne: viewerRole }, 'msg.seenAt': null }] }
    );
  },
};
