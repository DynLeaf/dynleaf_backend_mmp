import mongoose, { Document, Schema } from 'mongoose';

export type OrderStatus =
  | 'pending'
  | 'resubmitted'
  | 'accepted'
  | 'rejected'
  | 'printed'
  | 'poured'
  | 'sticker'
  | 'completed'
  | 'shipped';

export type DeliveryMethod = 'pickup' | 'shipping' | 'custom';
export type DesignType = 'custom' | 'qr';
export type ProductSource = 'own' | 'external';
export type OrderPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface IOrder extends Document {
  customerId: mongoose.Types.ObjectId;
  salespersonId: mongoose.Types.ObjectId;
  crafterId?: mongoose.Types.ObjectId;
  productType: string;
  purpose: string;
  designType: DesignType;
  productSource: ProductSource;
  quantity: number;
  expectedDeliveryDate: Date;
  priority: OrderPriority;
  deliveryMethod: DeliveryMethod;
  shippingAddress?: string;
  status: OrderStatus;
  notes?: string;
  rejectionReason?: string;
  crafterNotes?: string;
  salesAdditionalNotes?: string;
  crafterReply?: string;
  resubmissionLog?: Array<{
    resubmittedAt: Date;
    note: string;
    changes: Array<{
      field: string;
      oldValue: unknown;
      newValue: unknown;
    }>;
  }>;
  rejectionLog?: Array<{
    rejectedAt: Date;
    reason: string;
  }>;
  statusHistory?: Array<{
    status: OrderStatus;
    changedAt: Date;
    note?: string;
  }>;
  communicationLogs: Array<{
    senderRole: 'salesman' | 'crafter';
    senderId: mongoose.Types.ObjectId;
    content: string;
    timestamp: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'StaffCustomer',
      required: true,
    },
    salespersonId: {
      type: Schema.Types.ObjectId,
      ref: 'StaffUser',
      required: true,
    },
    crafterId: {
      type: Schema.Types.ObjectId,
      ref: 'StaffUser',
    },
    productType: { type: String, required: true, trim: true },
    purpose: { type: String, required: true, trim: true },
    designType: {
      type: String,
      enum: ['custom', 'qr'],
      required: true,
    },
    productSource: {
      type: String,
      enum: ['own', 'external'],
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    expectedDeliveryDate: { type: Date, required: true },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },
    deliveryMethod: {
      type: String,
      enum: ['pickup', 'shipping', 'custom'],
      required: true,
    },
    shippingAddress: { type: String, trim: true },
    status: {
      type: String,
      enum: ['pending', 'resubmitted', 'accepted', 'rejected', 'printed', 'poured', 'sticker', 'completed', 'shipped'],
      default: 'pending',
    },
    notes: { type: String, trim: true },
    rejectionReason: { type: String, trim: true },
    crafterNotes: { type: String, trim: true },
    salesAdditionalNotes: { type: String, trim: true },
    crafterReply: { type: String, trim: true },
    communicationLogs: [{
      senderRole: { type: String, enum: ['salesman', 'crafter'], required: true },
      senderId: { type: Schema.Types.ObjectId, ref: 'StaffUser', required: true },
      content: { type: String, required: true, trim: true },
      timestamp: { type: Date, default: Date.now }
    }],
    resubmissionLog: [{
      resubmittedAt: { type: Date, default: Date.now },
      note: { type: String, required: true },
      changes: [{
        field: { type: String, required: true },
        oldValue: { type: Schema.Types.Mixed },
        newValue: { type: Schema.Types.Mixed }
      }]
    }],
    rejectionLog: [{
      rejectedAt: { type: Date, default: Date.now },
      reason: { type: String, required: true }
    }],
    statusHistory: [{
      status: { type: String, required: true },
      changedAt: { type: Date, default: Date.now },
      note: { type: String, trim: true }
    }]
  },
  { timestamps: true }
);

export const Order = mongoose.model<IOrder>('StaffOrder', orderSchema);
