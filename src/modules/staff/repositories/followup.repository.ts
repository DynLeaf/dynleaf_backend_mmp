import { Followup, IFollowup, FollowupStatus, IFollowupEvent } from '../models/Followup.js';
import { buildFollowupDateTime } from '../utils/dateUtils.js';

// ─── Repository ───────────────────────────────────────────────────────────────

export const followupRepository = {
  async findById(id: string): Promise<IFollowup | null> {
    return Followup.findById(id)
      .populate('customerId', 'name instagramId mobile')
      .populate('customerId', 'name instagramId mobile')
      .populate('salespersonId', 'name email')
      .lean();
  },

  async findLatestPending(customerId: string, salespersonId: string): Promise<IFollowup | null> {
    return Followup.findOne({ customerId, salespersonId, status: 'pending' })
      .sort({ updatedAt: -1 })
      .lean();
  },

  async findByCustomer(customerId: string): Promise<IFollowup[]> {
    return Followup.find({ customerId }).sort({ followupDate: 1, followupTime: 1 }).lean();
  },

  async findBySalesperson(salespersonId: string, status?: FollowupStatus): Promise<IFollowup[]> {
    const filter: Record<string, unknown> = { salespersonId };
    if (status) filter.status = status;
    return Followup.find(filter)
      .populate('customerId', 'name instagramId mobile')
      .sort({ followupDate: 1 })
      .lean();
  },

  /**
   * Today: followupDate falls within today's 00:00–23:59 window AND status is pending.
   */
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
      .sort({ followupTime: 1 })
      .lean();
  },

  /**
   * Missed: followupDate is strictly before today (past date)
   *         OR followupDate is today but followupTime is already past.
   * Status must be pending (not done/rescheduled).
   * NOTE: Post-fetch time filtering for same-day rows is done in JS because
   * followupTime is a string, not a Date field.
   */
  async findMissed(salespersonId: string): Promise<IFollowup[]> {
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Fetch past-date rows directly from DB
    const pastDate = await Followup.find({
      salespersonId,
      status: 'pending',
      followupDate: { $lt: todayStart },
    })
      .populate('customerId', 'name instagramId mobile')
      .sort({ followupDate: -1 })
      .lean();

    // Fetch today's rows, then filter by time in JS
    const todayRows = await Followup.find({
      salespersonId,
      status: 'pending',
      followupDate: { $gte: todayStart, $lte: todayEnd },
    })
      .populate('customerId', 'name instagramId mobile')
      .lean();

    const pastTimeToday = todayRows.filter((f) => {
      if (!f.followupTime) return false;
      const dt = buildFollowupDateTime(f.followupDate, f.followupTime);
      return dt < now;
    });

    return [...(pastDate as IFollowup[]), ...pastTimeToday];
  },

  /**
   * Upcoming: followupDate > today OR (followupDate == today AND followupTime >= now).
   */
  async findUpcoming(salespersonId: string): Promise<IFollowup[]> {
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Future dates
    const futureDocs = await Followup.find({
      salespersonId,
      status: 'pending',
      followupDate: { $gt: todayEnd },
    })
      .populate('customerId', 'name instagramId mobile')
      .sort({ followupDate: 1 })
      .lean();

    // Today's rows where time is still in the future
    const todayDocs = await Followup.find({
      salespersonId,
      status: 'pending',
      followupDate: { $gte: todayStart, $lte: todayEnd },
    })
      .populate('customerId', 'name instagramId mobile')
      .lean();

    const upcomingToday = todayDocs.filter((f) => {
      if (!f.followupTime) return false;
      const dt = buildFollowupDateTime(f.followupDate, f.followupTime);
      return dt >= now;
    });

    return [...upcomingToday, ...futureDocs];
  },

  /**
   * Unified paginated+searchable query for GET /followups?filter=today|missed|all|upcoming
   */
  async findFiltered(opts: {
    salespersonId: string;
    filter: 'today' | 'missed' | 'upcoming' | 'all';
    search?: string;
    status?: FollowupStatus;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page: number;
    limit: number;
  }): Promise<{ data: IFollowup[]; total: number }> {
    const { salespersonId, filter, search, status, sortBy = 'followupDate', sortOrder = 'desc', page, limit } = opts;

    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const baseFilter: Record<string, unknown> = { salespersonId };

    // Apply time-based filter at DB level where possible
    if (filter === 'today') {
      baseFilter.followupDate = { $gte: todayStart, $lte: todayEnd };
      baseFilter.status = 'pending';
    } else if (filter === 'missed') {
      // Past dates only at DB level; same-day time filtering done post-fetch
      baseFilter.followupDate = { $lt: todayStart };
      baseFilter.status = 'pending';
    } else if (filter === 'upcoming') {
      baseFilter.followupDate = { $gt: todayEnd };
      baseFilter.status = 'pending';
    } else {
      // 'all' — optional status override
      if (status) baseFilter.status = status;
    }

    // Customer name/mobile search via populate+post-filter approach:
    // We join customer data after fetching, then filter.
    // For large datasets, a $lookup aggregation would be preferred.
    const allowed = ['followupDate', 'createdAt', 'updatedAt'];
    const field = allowed.includes(sortBy) ? sortBy : 'followupDate';
    const sort: Record<string, 1 | -1> = { [field]: sortOrder === 'asc' ? 1 : -1 };

    if (filter === 'missed' || filter === 'upcoming') {
      const isMissed = filter === 'missed';

      // DB-level date filter
      const dateFilter = isMissed ? { $lt: todayStart } : { $gt: todayEnd };

      // Fetch primary dates (past for missed, future for upcoming)
      const dateDocs = await Followup.find({ ...baseFilter, followupDate: dateFilter, status: 'pending' })
        .populate('customerId', 'name instagramId mobile')
        .lean() as IFollowup[];

      // Fetch today's rows to filter by time
      const todayDocs = await Followup.find({
        salespersonId,
        status: 'pending',
        followupDate: { $gte: todayStart, $lte: todayEnd },
      })
        .populate('customerId', 'name instagramId mobile')
        .lean() as IFollowup[];

      const timeFilteredToday = todayDocs.filter((f) => {
        if (!f.followupTime) return isMissed; // Default no-time to missed logically, or skip based on preference
        const fTime = buildFollowupDateTime(f.followupDate, f.followupTime);
        return isMissed ? fTime < now : fTime >= now;
      });

      let combined = [...dateDocs, ...timeFilteredToday];

      // Sort the combined results in memory
      combined.sort((a, b) => {
        let valA: string | number | Date = a[field as keyof IFollowup] as string | number | Date;
        let valB: string | number | Date = b[field as keyof IFollowup] as string | number | Date;

        // Use exact timestamp for precise chronological sorting
        if (field === 'followupDate') {
          valA = buildFollowupDateTime(a.followupDate, a.followupTime).getTime();
          valB = buildFollowupDateTime(b.followupDate, b.followupTime).getTime();
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });

      // Apply search filter
      if (search) {
        const q = search.toLowerCase();
        combined = combined.filter((f) => {
          const customer = typeof f.customerId === 'object' ? (f.customerId as { name?: string; mobile?: string; instagramId?: string }) : null;
          if (!customer) return false;
          return (
            customer.name?.toLowerCase().includes(q) ||
            customer.mobile?.includes(q) ||
            customer.instagramId?.toLowerCase().includes(q)
          );
        });
      }

      const total = combined.length;
      const skip = (page - 1) * limit;
      const data = combined.slice(skip, skip + limit);
      return { data, total };
    }

    // For today / upcoming / all: standard paginated query
    let query = Followup.find(baseFilter).populate('customerId', 'name instagramId mobile').sort(sort);

    if (!search) {
      // No search — use DB-level pagination
      const [data, total] = await Promise.all([
        query.skip((page - 1) * limit).limit(limit).lean(),
        Followup.countDocuments(baseFilter),
      ]);
      return { data: data as IFollowup[], total };
    }

    // With search — fetch all, filter, then paginate in JS
    const allDocs = await query.lean() as IFollowup[];
    const q = search.toLowerCase();
    const filtered = allDocs.filter((f) => {
      const customer = typeof f.customerId === 'object' ? (f.customerId as { name?: string; mobile?: string; instagramId?: string }) : null;
      if (!customer) return false;
      return (
        customer.name?.toLowerCase().includes(q) ||
        customer.mobile?.includes(q) ||
        customer.instagramId?.toLowerCase().includes(q)
      );
    });

    const total = filtered.length;
    const skip = (page - 1) * limit;
    const data = filtered.slice(skip, skip + limit);
    return { data, total };
  },

  /**
   * Stats: count of today / missed / upcoming for the stats endpoint.
   */
  async getStatsBySalesperson(salespersonId: string): Promise<{ today: number; missed: number; upcoming: number }> {
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [todayCount, pastDateMissed, todayAllPending, upcomingCount] = await Promise.all([
      Followup.countDocuments({
        salespersonId,
        status: 'pending',
        followupDate: { $gte: todayStart, $lte: todayEnd },
      }),
      Followup.countDocuments({
        salespersonId,
        status: 'pending',
        followupDate: { $lt: todayStart },
      }),
      Followup.find({
        salespersonId,
        status: 'pending',
        followupDate: { $gte: todayStart, $lte: todayEnd },
      })
        .select('followupDate followupTime')
        .lean(),
      Followup.countDocuments({
        salespersonId,
        status: 'pending',
        followupDate: { $gt: todayEnd },
      }),
    ]);

    let sameDayMissed = 0;
    let sameDayUpcoming = 0;

    todayAllPending.forEach((f: Pick<IFollowup, 'followupDate' | 'followupTime'>) => {
      if (!f.followupTime) return;
      if (buildFollowupDateTime(f.followupDate, f.followupTime) < now) {
        sameDayMissed++;
      } else {
        sameDayUpcoming++;
      }
    });

    return {
      today: todayCount,
      missed: pastDateMissed + sameDayMissed,
      upcoming: upcomingCount + sameDayUpcoming,
    };
  },

  async create(data: Partial<IFollowup>): Promise<IFollowup> {
    const followup = new Followup(data);
    return followup.save();
  },

  async updateById(id: string, data: Partial<IFollowup>): Promise<IFollowup | null> {
    return Followup.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
  },

  async countMissedBySalesperson(salespersonId: string): Promise<number> {
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [pastDateCount, todayDocs] = await Promise.all([
      Followup.countDocuments({
        salespersonId,
        status: 'pending',
        followupDate: { $lt: todayStart },
      }),
      Followup.find({
        salespersonId,
        status: 'pending',
        followupDate: { $gte: todayStart, $lte: (() => { const e = new Date(); e.setHours(23, 59, 59, 999); return e; })() },
      })
        .select('followupDate followupTime')
        .lean(),
    ]);

    const sameDayMissed = todayDocs.filter((f: Pick<IFollowup, 'followupDate' | 'followupTime'>) => {
      if (!f.followupTime) return false;
      return buildFollowupDateTime(f.followupDate, f.followupTime) < now;
    }).length;

    return pastDateCount + sameDayMissed;
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
    const filter: Record<string, unknown> = { salespersonId };
    if (status) filter.status = status;
    const allowed = ['followupDate', 'createdAt', 'updatedAt'];
    const field = allowed.includes(sortBy) ? sortBy : 'followupDate';
    const sort: Record<string, 1 | -1> = { [field]: sortOrder === 'asc' ? 1 : -1 };
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Followup.find(filter)
        .populate('customerId', 'name instagramId mobile')
        .sort(sort).skip(skip).limit(limit).lean(),
      Followup.countDocuments(filter),
    ]);
    return { data: data as IFollowup[], total };
  },

  async markPendingAsDone(customerId: string, message?: string): Promise<void> {
    const historyEntry: IFollowupEvent = {
      message: message || 'Marked done automatically',
      status: 'done',
      followupDate: new Date(),
      followupTime: '00:00',
      recordedAt: new Date(),
    };

    const pendingDocs = await Followup.find({ customerId, status: 'pending' }).select('_id followupDate followupTime').lean() as Pick<IFollowup, '_id' | 'followupDate' | 'followupTime'>[];
    const now = new Date();
    
    const missedIds = pendingDocs.filter(f => {
      if (!f.followupTime) return true;
      const fTime = buildFollowupDateTime(f.followupDate, f.followupTime);
      return fTime < now;
    }).map(f => f._id);

    if (missedIds.length > 0) {
      await Followup.updateMany(
        { _id: { $in: missedIds } },
        {
          $set: { status: 'done' },
          $push: { history: historyEntry }
        }
      );
    }
  },
};
