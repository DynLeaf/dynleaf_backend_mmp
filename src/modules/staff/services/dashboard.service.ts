import { customerRepository } from '../repositories/customer.repository.js';
import { followupRepository } from '../repositories/followup.repository.js';
import { orderRepository } from '../repositories/order.repository.js';
import { staffUserRepository } from '../repositories/staffUser.repository.js';
import { crafterEarningRepository } from '../repositories/crafterEarning.repository.js';
import { crafterPayoutRepository } from '../repositories/crafterPayout.repository.js';

import mongoose from 'mongoose';

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

  async getPriorityTasks(salespersonId: string, query: Record<string, unknown>) {
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
    const ownerId = String((customer.createdBy as { _id?: mongoose.Types.ObjectId })?._id ?? customer.createdBy);
    if (ownerId !== salespersonId) throw new Error('Forbidden');
    if (!customer.isPriority) throw new Error('This customer is not marked as a priority task');
    return customerRepository.addPriorityMessage(customerId, 'salesperson', salespersonId, content);
  },

  async markTaskSeen(customerId: string, salespersonId: string) {
    const customer = await customerRepository.findById(customerId);
    if (!customer) throw new Error('Customer not found');
    const ownerId = String((customer.createdBy as { _id?: mongoose.Types.ObjectId })?._id ?? customer.createdBy);
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
  async fixFollowups() {
    const convertedCustomers = await customerRepository.findByStatus('converted');

    let updatedCount = 0;
    for (const customer of convertedCustomers) {
      const customerId = (customer._id as mongoose.Types.ObjectId).toString();
      await followupRepository.markPendingAsDone(customerId, 'Auto-cleaned up: Customer already converted');
      updatedCount++;
    }
    return updatedCount;
  },

  async getSalesTracking() {
    const salesmen = await staffUserRepository.findByRole('salesman');

    const tracking = await Promise.all(
      salesmen.map(async (s) => {
        const id = String(s._id);
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
    const crafters = await staffUserRepository.findByRole('crafter');

    const tracking = await Promise.all(
      crafters.map(async (c) => {
        const id = String(c._id);
        const [accepted, shipped, pending, totalEarnings, totalPaid, pendingPayout] = await Promise.all([
          orderRepository.countByCrafter(id, 'accepted'),
          orderRepository.countByCrafter(id, 'shipped'),
          orderRepository.countByCrafter(id, 'pending'),
          crafterEarningRepository.sumByCrafter(id),
          crafterEarningRepository.sumByCrafterAndStatus(id, 'paid'),
          crafterEarningRepository.sumByCrafterAndStatus(id, 'pending'),
        ]);

        return {
          crafter: { id, name: c.name, email: c.email },
          acceptedOrders: accepted,
          completedOrders: shipped,
          pendingOrders: pending,
          totalEarnings,
          totalPaid,
          pendingPayout,
        };
      })
    );

    return tracking;
  },

  async getSalespersonDetails(salespersonId: string) {
    const salesperson = await staffUserRepository.findById(salespersonId);
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

  async getSalespersonCustomers(salespersonId: string, query: Record<string, unknown>) {
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || 20;
    const tab = (query.tab as string) || 'all';

    return customerRepository.findPaginated({
      salespersonId,
      tab: tab as 'active' | 'converted' | 'cancelled' | 'all' | 'followup' | 'missed',
      page,
      limit,
    });
  },

  async setCustomerPriority(customerId: string, isPriority: boolean, note: string, adminId: string) {
    const now = new Date();
    const update: Record<string, unknown> = {
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
    const crafter = await staffUserRepository.findById(crafterId);
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
