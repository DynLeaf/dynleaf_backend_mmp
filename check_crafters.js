import mongoose from 'mongoose';
import { StaffUser } from './src/modules/staff/models/StaffUser.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const crafters = await StaffUser.find({ role: 'crafter' }).lean();
  console.log('Crafters count:', crafters.length);
  crafters.forEach(c => console.log(`- ${c.name} (${c._id}) role: ${c.role}`));
  await mongoose.disconnect();
}
check();
