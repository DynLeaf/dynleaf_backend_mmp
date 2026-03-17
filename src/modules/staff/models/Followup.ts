import mongoose, { Document, Schema } from 'mongoose';

export type FollowupStatus = 'pending' | 'done' | 'rescheduled' | 'missed';

export interface IFollowupEvent {
  message: string;
  status: FollowupStatus;
  followupDate: Date;
  followupTime: string;
  recordedAt: Date;
}

export interface IFollowup extends Document {
  customerId: mongoose.Types.ObjectId;
  salespersonId: mongoose.Types.ObjectId;
  followupDate: Date;
  followupTime: string;
  message: string;
  status: FollowupStatus;
  history: IFollowupEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const followupEventSchema = new Schema<IFollowupEvent>(
  {
    message: { type: String },
    status: {
      type: String,
      enum: ['pending', 'done', 'rescheduled', 'missed'],
      required: true,
    },
    followupDate: { type: Date, required: true },
    followupTime: { type: String, required: true },
    recordedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const followupSchema = new Schema<IFollowup>(
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
    followupDate: { type: Date, required: true },
    followupTime: { type: String, required: true },
    message: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'done', 'rescheduled', 'missed'],
      default: 'pending',
    },
    history: { type: [followupEventSchema], default: [] },
  },
  { timestamps: true }
);

// Compound indexes for efficient time-based filtering
followupSchema.index({ salespersonId: 1, followupDate: 1, status: 1 });
followupSchema.index({ salespersonId: 1, status: 1 });
followupSchema.index({ salespersonId: 1, followupDate: -1 });

export const Followup = mongoose.model<IFollowup>('StaffFollowup', followupSchema);
