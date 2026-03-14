import mongoose, { Document, Schema } from 'mongoose';

export type PayoutStatus = 'pending' | 'paid';

export interface ICrafterPayout extends Document {
  crafterId: mongoose.Types.ObjectId;
  totalAmount: number;
  ordersIncluded: mongoose.Types.ObjectId[];
  earningsIncluded: mongoose.Types.ObjectId[];
  status: PayoutStatus;
  note?: string;
  paidAt?: Date;
  processedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const crafterPayoutSchema = new Schema<ICrafterPayout>(
  {
    crafterId: {
      type: Schema.Types.ObjectId,
      ref: 'StaffUser',
      required: true,
    },
    totalAmount: { type: Number, required: true },
    ordersIncluded: [{ type: Schema.Types.ObjectId, ref: 'StaffOrder' }],
    earningsIncluded: [{ type: Schema.Types.ObjectId, ref: 'CrafterEarning' }],
    status: {
      type: String,
      enum: ['pending', 'paid'],
      default: 'pending',
    },
    note: { type: String, trim: true },
    paidAt: { type: Date },
    processedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

export const CrafterPayout = mongoose.model<ICrafterPayout>('CrafterPayout', crafterPayoutSchema);
