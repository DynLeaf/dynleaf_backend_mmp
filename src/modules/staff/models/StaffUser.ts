import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export type StaffRole = 'salesman' | 'crafter' | 'admin';
export type StaffStatus = 'active' | 'blocked';

export interface IStaffUser extends Document {
  name: string;
  email: string;
  password: string;
  role: StaffRole;
  status: StaffStatus;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const staffUserSchema = new Schema<IStaffUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email'],
    },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['salesman', 'crafter', 'admin'],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'blocked'],
      default: 'active',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'StaffUser' },
  },
  { timestamps: true }
);

staffUserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

staffUserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export const StaffUser = mongoose.model<IStaffUser>('StaffUser', staffUserSchema);
