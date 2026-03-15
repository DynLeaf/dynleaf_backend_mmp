import mongoose, { Document, Schema } from 'mongoose';

export type EarningAction = 'poured' | 'sticker' | 'printed' | 'other';

const EARNING_RATES: Record<EarningAction, number> = {
  poured: 5,
  sticker: 5,
  printed: 0,
  other: 0,
};

export interface ICrafterEarning extends Document {
  orderId: mongoose.Types.ObjectId;
  crafterId: mongoose.Types.ObjectId;
  action: EarningAction;
  quantity: number;
  rate: number;
  amount: number;
  status: 'pending' | 'paid';
  createdAt: Date;
}

const crafterEarningSchema = new Schema<ICrafterEarning>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'StaffOrder',
      required: true,
    },
    crafterId: {
      type: Schema.Types.ObjectId,
      ref: 'StaffUser',
      required: true,
    },
    action: {
      type: String,
      enum: ['poured', 'sticker', 'printed', 'other'],
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    rate: { type: Number, required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'paid'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

// Auto-calculate rate and amount before save
crafterEarningSchema.pre('save', function () {
  if (this.isNew || this.isModified('action') || this.isModified('quantity')) {
    this.rate = EARNING_RATES[this.action] ?? 0;
    this.amount = this.rate * this.quantity;
  }
});

export { EARNING_RATES };
export const CrafterEarning = mongoose.model<ICrafterEarning>('CrafterEarning', crafterEarningSchema);
