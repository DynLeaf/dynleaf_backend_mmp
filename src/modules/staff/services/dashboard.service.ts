import { customerRepository } from '../repositories/customer.repository.js';
import { followupRepository } from '../repositories/followup.repository.js';
import { orderRepository } from '../repositories/order.repository.js';
import { StaffUser } from '../models/StaffUser.js';
import { crafterEarningRepository } from '../repositories/crafterEarning.repository.js';
import { crafterPayoutRepository } from '../repositories/crafterPayout.repository.js';

export const salesDashboardService = {
  async getSummary(salespersonId: string) {
    const [
      totalCustomers,
      converted,
      cancelled,
      todayFollowups,
      missedFollowups,
      upcomingFollowups,
      priorityCustomers
    ] = await Promise.all([
      customerRepository.countByCreatedBy(salespersonId),
      customerRepository.countByStatus(salespersonId, 'converted'),
      customerRepository.countByStatus(salespersonId, 'cancelled'),
      followupRepository.findTodayBySalesperson(salespersonId),
      followupRepository.findMissed(salespersonId),
      followupRepository.findUpcoming(salespersonId),
      customerRepository.findPriorityBySalesperson(salespersonId)
    ]);

    return {
      totalCustomers,
      converted,
      cancelled,
      followupsToday: todayFollowups.length,
      missedFollowups: missedFollowups.length,
      upcomingFollowups: upcomingFollowups.length,
      priorityFollowups: priorityCustomers || [],
    };
  },

  async getPriorityTasks(salespersonId: string, query: any) {
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || 10;
    return customerRepository.findPriorityPaginatedBySalesperson(salespersonId, page, limit);
  },

  // Legacy kept for older clients
  async replyToPriorityNote(customerId: string, reply: string) {
    return customerRepository.updateById(customerId, { salespersonReply: reply });
  },

  async sendPriorityMessage(customerId: string, salespersonId: string, content: string) {
    const customer = await customerRepository.findById(customerId);
    if (!customer) throw new Error('Customer not found');
    const ownerId = String((customer.createdBy as any)?._id ?? customer.createdBy);
    if (ownerId !== salespersonId) throw new Error('Forbidden');
    if (!customer.isPriority) throw new Error('This customer is not marked as a priority task');
    return customerRepository.addPriorityMessage(customerId, 'salesperson', salespersonId, content);
  },

  async markTaskSeen(customerId: string, salespersonId: string) {
    const customer = await customerRepository.findById(customerId);
    if (!customer) throw new Error('Customer not found');
    const ownerId = String((customer.createdBy as any)?._id ?? customer.createdBy);
    if (ownerId !== salespersonId) throw new Error('Forbidden');
    return customerRepository.markPriorityMessagesSeen(customerId, 'salesperson');
  },
};

export const crafterDashboardService = {
  async getSummary(crafterId: string) {
    const [newOrders, acceptedOrders, completedOrders, pendingOrders] = await Promise.all([
      orderRepository.findPendingOrders(),
      orderRepository.findByCrafter(crafterId, 'accepted'),
      orderRepository.findByCrafter(crafterId, 'completed'),
      orderRepository.findByCrafter(crafterId, 'poured'),
    ]);

    return {
      newOrders: newOrders.length,
      acceptedOrders: acceptedOrders.length,
      completedOrders: completedOrders.length,
    };
  },
};

export const adminDashboardService = {
  async getSalesTracking() {
    const salesmen = await StaffUser.find({ role: 'salesman' }).lean();

    const tracking = await Promise.all(
      salesmen.map(async (s) => {
        const id = (s._id as any).toString();
        const [total, converted, cancelled, missed, upcoming] = await Promise.all([
          customerRepository.countByCreatedBy(id),
          customerRepository.countByStatus(id, 'converted'),
          customerRepository.countByStatus(id, 'cancelled'),
          followupRepository.countMissedBySalesperson(id),
          followupRepository.findUpcoming(id),
        ]);

        return {
          salesperson: { id, name: s.name, email: s.email },
          totalCustomers: total,
          conversions: converted,
          cancelled,
          missedFollowups: missed,
          upcomingFollowups: upcoming.length,
        };
      })
    );

    return tracking;
  },

  async getCrafterTracking() {
    const crafters = await StaffUser.find({ role: 'crafter' }).lean();

    const tracking = await Promise.all(
      crafters.map(async (c) => {
        const id = (c._id as any).toString();
        const [accepted, completed, pending, totalEarnings, pendingPayout] = await Promise.all([
          orderRepository.countByCrafter(id, 'accepted'),
          orderRepository.countByCrafter(id, 'completed'),
          orderRepository.countByCrafter(id, 'pending'),
          crafterEarningRepository.sumByCrafter(id),
          crafterPayoutRepository.sumPendingByCrafter(id),
        ]);

        return {
          crafter: { id, name: c.name, email: c.email },
          acceptedOrders: accepted,
          completedOrders: completed,
          pendingOrders: pending,
          totalEarnings,
          pendingPayout,
        };
      })
    );

    return tracking;
  },

  async getSalespersonDetails(salespersonId: string) {
    const salesperson = await StaffUser.findById(salespersonId).lean();
    if (!salesperson) throw new Error('Salesperson not found');

    const [customers, followups, orders] = await Promise.all([
      customerRepository.findByCreatedBy(salespersonId),
      followupRepository.findBySalesperson(salespersonId),
      orderRepository.findBySalesperson(salespersonId)
    ]);

    return {
      salesperson,
      customers,
      followups,
      orders
    };
  },

  async getSalespersonCustomers(salespersonId: string, query: any) {
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || 20;
    const tab = (query.tab as any) || 'all';

    return customerRepository.findPaginated({
      salespersonId,
      tab,
      page,
      limit,
    });
  },

  async setCustomerPriority(customerId: string, isPriority: boolean, note: string, adminId: string) {
    const now = new Date();
    const update: any = {
      isPriority,
      adminPriorityNote: note,
      priorityUpdatedAt: isPriority ? now : undefined,
    };
    const updated = await customerRepository.updateById(customerId, update);
    // Push the note as the first message when flagging as priority
    if (isPriority && note?.trim()) {
      await customerRepository.addPriorityMessage(customerId, 'admin', adminId, note.trim());
    }
    return updated;
  },

  async sendAdminPriorityMessage(customerId: string, adminId: string, content: string) {
    const customer = await customerRepository.findById(customerId);
    if (!customer) throw new Error('Customer not found');
    if (!customer.isPriority) throw new Error('This customer is not marked as a priority task');
    return customerRepository.addPriorityMessage(customerId, 'admin', adminId, content);
  },

  async markAdminTaskSeen(customerId: string) {
    const customer = await customerRepository.findById(customerId);
    if (!customer) throw new Error('Customer not found');
    return customerRepository.markPriorityMessagesSeen(customerId, 'admin');
  },

  async getCrafterDetails(crafterId: string) {
    const crafter = await StaffUser.findById(crafterId).lean();
    if (!crafter) throw new Error('Crafter not found');

    const [orders, earnings, payouts] = await Promise.all([
      orderRepository.findByCrafter(crafterId),
      crafterEarningRepository.findByCrafter(crafterId),
      crafterPayoutRepository.findByCrafter(crafterId)
    ]);

    return {
      crafter,
      orders,
      earnings,
      payouts
    };
  }
};
