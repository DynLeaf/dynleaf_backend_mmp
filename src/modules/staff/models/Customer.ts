import mongoose, { Document, Schema } from 'mongoose';

export type CustomerStatus = 'active' | 'converted' | 'cancelled';

export interface ICustomer extends Document {
  name: string;
  instagramId?: string;
  mobile?: string;
  note?: string;
  createdBy: mongoose.Types.ObjectId;
  status: CustomerStatus;
  followupRequired: boolean;
  followupDate?: Date;
  followupTime?: string;
  isPriority: boolean;
  adminPriorityNote?: string;
  salespersonReply?: string;
  priorityUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true, trim: true },
    instagramId: { type: String, trim: true },
    mobile: { type: String, trim: true },
    note: { type: String, trim: true },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'StaffUser',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'converted', 'cancelled'],
      default: 'active',
    },
    followupRequired: { type: Boolean, default: false },
    followupDate: { type: Date },
    followupTime: { type: String },
    isPriority: { type: Boolean, default: false },
    adminPriorityNote: { type: String, trim: true },
    salespersonReply: { type: String, trim: true },
    priorityUpdatedAt: { type: Date },
  },
  { timestamps: true }
);

// At least one contact method required — enforced at service level

export const Customer = mongoose.model<ICustomer>('StaffCustomer', customerSchema);
