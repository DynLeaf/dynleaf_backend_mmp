import { Followup, IFollowup, FollowupStatus } from '../models/Followup.js';

export const followupRepository = {
  async findById(id: string): Promise<IFollowup | null> {
    return Followup.findById(id)
      .populate('customerId', 'name instagramId mobile')
      .populate('salespersonId', 'name email')
      .lean();
  },

  async findByCustomer(customerId: string): Promise<IFollowup[]> {
    return Followup.find({ customerId }).sort({ followupDate: 1, followupTime: 1 }).lean();
  },

  async findBySalesperson(salespersonId: string, status?: FollowupStatus): Promise<IFollowup[]> {
    const filter: any = { salespersonId };
    if (status) filter.status = status;
    return Followup.find(filter)
      .populate('customerId', 'name instagramId mobile')
      .sort({ followupDate: 1 })
      .lean();
  },

  async findTodayBySalesperson(salespersonId: string): Promise<IFollowup[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return Followup.find({
      salespersonId,
      followupDate: { $gte: start, $lte: end },
      status: 'pending',
    })
      .populate('customerId', 'name instagramId mobile')
      .lean();
  },

  async findMissed(salespersonId: string): Promise<IFollowup[]> {
    const now = new Date();
    return Followup.find({
      salespersonId,
      status: 'pending',
      followupDate: { $lt: now },
    })
      .populate('customerId', 'name instagramId mobile')
      .lean();
  },

  async findUpcoming(salespersonId: string): Promise<IFollowup[]> {
    const now = new Date();
    return Followup.find({
      salespersonId,
      status: 'pending',
      followupDate: { $gt: now },
    })
      .populate('customerId', 'name instagramId mobile')
      .sort({ followupDate: 1 })
      .lean();
  },

  async create(data: Record<string, any>): Promise<IFollowup> {
    const followup = new Followup(data);
    return followup.save();
  },

  async updateById(id: string, data: Partial<IFollowup>): Promise<IFollowup | null> {
    return Followup.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
  },

  async countMissedBySalesperson(salespersonId: string): Promise<number> {
    const now = new Date();
    return Followup.countDocuments({
      salespersonId,
      status: 'pending',
      followupDate: { $lt: now },
    });
  },

  async findPaginated(opts: {
    salespersonId: string;
    status?: FollowupStatus;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page: number;
    limit: number;
  }): Promise<{ data: IFollowup[]; total: number }> {
    const { salespersonId, status, sortBy = 'followupDate', sortOrder = 'desc', page, limit } = opts;
    const filter: any = { salespersonId };
    if (status) filter.status = status;
    const allowed = ['followupDate', 'createdAt', 'updatedAt'];
    const field = allowed.includes(sortBy) ? sortBy : 'followupDate';
    const sort: any = { [field]: sortOrder === 'asc' ? 1 : -1 };
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Followup.find(filter)
        .populate('customerId', 'name instagramId mobile')
        .sort(sort).skip(skip).limit(limit).lean(),
      Followup.countDocuments(filter),
    ]);
    return { data: data as IFollowup[], total };
  },
};
