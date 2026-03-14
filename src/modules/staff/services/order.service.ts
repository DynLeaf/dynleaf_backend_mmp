import { orderRepository } from '../repositories/order.repository.js';
import { crafterEarningRepository } from '../repositories/crafterEarning.repository.js';
import { IOrder, OrderStatus, DeliveryMethod } from '../models/Order.js';
import { EARNING_RATES, EarningAction } from '../models/CrafterEarning.js';

export const orderService = {
  async getAll(filter?: Partial<{ status: OrderStatus; salespersonId: string; crafterId: string }>): Promise<IOrder[]> {
    return orderRepository.findAll(filter);
  },

  async getById(id: string): Promise<IOrder> {
    const order = await orderRepository.findById(id);
    if (!order) throw new Error('Order not found');
    return order;
  },

  async getBySalesperson(salespersonId: string, status?: OrderStatus): Promise<IOrder[]> {
    return orderRepository.findBySalesperson(salespersonId, status);
  },

  async getByCrafter(crafterId: string, status?: OrderStatus): Promise<IOrder[]> {
    return orderRepository.findByCrafter(crafterId, status);
  },

  async getPendingOrders(): Promise<IOrder[]> {
    return orderRepository.findPendingOrders();
  },

  async create(data: {
    customerId: string;
    salespersonId: string;
    productType: string;
    purpose: string;
    designType: 'custom' | 'qr';
    productSource: 'own' | 'external';
    quantity: number;
    expectedDeliveryDate: Date;
    priority?: string;
    deliveryMethod: DeliveryMethod;
    shippingAddress?: string;
    notes?: string;
  }): Promise<IOrder> {
    if (!data.customerId) throw new Error('Customer is required');
    if (!data.productType?.trim()) throw new Error('Product type is required');
    if (!data.purpose?.trim()) throw new Error('Purpose is required');
    if (!data.quantity || data.quantity < 1) throw new Error('Quantity must be at least 1');
    if (!data.expectedDeliveryDate) throw new Error('Expected delivery date is required');
    if (!data.deliveryMethod) throw new Error('Delivery method is required');
    if (data.deliveryMethod === 'shipping' && !data.shippingAddress?.trim()) {
      throw new Error('Shipping address is required for shipping delivery');
    }

    return orderRepository.create({
      ...data,
      expectedDeliveryDate: new Date(data.expectedDeliveryDate),
      status: 'pending',
    });
  },

  async accept(id: string, crafterId: string): Promise<IOrder> {
    const order = await orderRepository.findById(id);
    if (!order) throw new Error('Order not found');
    if (order.status !== 'pending') throw new Error('Only pending orders can be accepted');

    const updated = await orderRepository.updateStatus(id, 'accepted', { crafterId: crafterId as any });
    if (!updated) throw new Error('Order not found');
    return updated;
  },

  async reject(id: string, crafterId: string, reason: string): Promise<IOrder> {
    if (!reason?.trim()) throw new Error('Rejection reason is required');
    const order = await orderRepository.findById(id);
    if (!order) throw new Error('Order not found');
    if (!['pending', 'accepted'].includes(order.status)) {
      throw new Error('Order cannot be rejected at this stage');
    }

    const updated = await orderRepository.updateStatus(id, 'rejected', {
      crafterId: crafterId as any,
      rejectionReason: reason,
    });
    if (!updated) throw new Error('Order not found');
    return updated;
  },

  async updateWorkflowStatus(
    id: string,
    crafterId: string,
    status: Extract<OrderStatus, 'printed' | 'poured' | 'sticker' | 'completed' | 'shipped'>,
    crafterNotes?: string
  ): Promise<IOrder> {
    const order = await orderRepository.findById(id);
    if (!order) throw new Error('Order not found');

    const orderCrafterId = (order.crafterId as any)?._id?.toString() || (order.crafterId as any)?.toString();
    if (orderCrafterId !== crafterId) throw new Error('Not authorized for this order');

    const statusOrder: OrderStatus[] = ['pending', 'accepted', 'printed', 'poured', 'sticker', 'completed', 'shipped'];
    const currentIndex = statusOrder.indexOf(order.status);
    const newIndex = statusOrder.indexOf(status);

    if (newIndex === -1) throw new Error('Invalid status');

    // If moving backward, check for paid earnings
    if (newIndex < currentIndex) {
      const existingEarnings = await crafterEarningRepository.findByOrder(id);
      
      // Earning actions that might be undone
      const actionsToUndo: EarningAction[] = [];
      if (currentIndex >= statusOrder.indexOf('poured') && newIndex < statusOrder.indexOf('poured')) {
        actionsToUndo.push('poured');
      }
      if (currentIndex >= statusOrder.indexOf('sticker') && newIndex < statusOrder.indexOf('sticker')) {
        actionsToUndo.push('sticker');
      }

      for (const action of actionsToUndo) {
        const earning = existingEarnings.find(e => e.action === action);
        if (earning && earning.status === 'paid') {
          throw new Error(`Cannot move back to ${status}: ${action} earning already paid`);
        }
      }

      // Delete pending earnings for undone actions
      for (const action of actionsToUndo) {
        await crafterEarningRepository.deleteByOrderAction(id, action);
      }
    }

    const extra: Partial<IOrder> = {};
    if (crafterNotes) extra.crafterNotes = crafterNotes;

    const updated = await orderRepository.updateStatus(id, status, extra);
    if (!updated) throw new Error('Order not found');

    // Auto-create earning records for relevant actions
    const earningActions: Record<string, EarningAction> = {
      poured: 'poured',
      sticker: 'sticker',
    };

    if (earningActions[status]) {
      const action = earningActions[status];
      
      // Check if already exists to avoid duplicates
      const existing = await crafterEarningRepository.findByOrder(id);
      if (!existing.some(e => e.action === action)) {
        const rate = EARNING_RATES[action];
        await crafterEarningRepository.create({
          orderId: (order._id as any).toString() as any,
          crafterId: crafterId as any,
          action,
          quantity: order.quantity,
          rate,
          amount: rate * order.quantity,
          status: 'pending'
        });
      }
    }

    return updated;
  },

  async resubmit(id: string, salespersonId: string, data: Partial<IOrder>): Promise<IOrder> {
    const order = await orderRepository.findById(id);
    if (!order) throw new Error('Order not found');

    // Handle populated or raw salespersonId
    const orderSalespersonId = (order.salespersonId as any)?._id?.toString() || (order.salespersonId as any)?.toString();

    if (orderSalespersonId !== salespersonId) {
      throw new Error('Not authorized');
    }
    if (order.status !== 'rejected') throw new Error('Only rejected orders can be resubmitted');

    const updated = await orderRepository.updateById(id, {
      ...data,
      status: 'pending',
      rejectionReason: undefined,
    });
    if (!updated) throw new Error('Order not found');
    return updated;
  },

  async addSalesNote(id: string, salespersonId: string, note: string): Promise<IOrder> {
    const order = await orderRepository.findById(id);
    if (!order) throw new Error('Order not found');

    // Handle populated or raw salespersonId
    const orderSalespersonId = (order.salespersonId as any)?._id?.toString() || (order.salespersonId as any)?.toString();
    
    if (orderSalespersonId !== salespersonId) {
      throw new Error('Not authorized');
    }

    const updated = await orderRepository.updateById(id, {
      salesAdditionalNotes: note,
      $push: {
        communicationLogs: {
          senderRole: 'salesman',
          senderId: salespersonId as any,
          content: note,
          timestamp: new Date()
        }
      }
    } as any);
    if (!updated) throw new Error('Order not found');
    return updated;
  },

  async addCrafterNote(id: string, crafterId: string, note: string): Promise<IOrder> {
    const order = await orderRepository.findById(id);
    if (!order) throw new Error('Order not found');

    const orderCrafterId = (order.crafterId as any)?._id?.toString() || (order.crafterId as any)?.toString();
    if (orderCrafterId !== crafterId) throw new Error('Not authorized');

    const updated = await orderRepository.updateById(id, {
      crafterReply: note,
      $push: {
        communicationLogs: {
          senderRole: 'crafter',
          senderId: crafterId as any,
          content: note,
          timestamp: new Date()
        }
      }
    } as any);
    if (!updated) throw new Error('Order not found');
    return updated;
  },

  async getPaginated(opts: {
    salespersonId?: string;
    crafterId?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: IOrder[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(opts.limit) || 20));
    const { data, total } = await orderRepository.findPaginated({
      salespersonId: opts.salespersonId,
      crafterId: opts.crafterId,
      status: opts.status,
      sortBy: opts.sortBy,
      sortOrder: opts.sortOrder as 'asc' | 'desc',
      page,
      limit,
    });
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } };
  },
};
