/**
 * Force-fix: for EVERY StaffFollowup, look up its customer and set
 * salespersonId = customer.createdBy. This guarantees correct linkage
 * regardless of what was stored before.
 */
import 'dotenv/config';
import connectDB from '../config/db.js';
import { Customer } from '../modules/staff/models/Customer.js';
import { Followup } from '../modules/staff/models/Followup.js';
import mongoose from 'mongoose';

(async () => {
  await connectDB();

  const allFollowups = await Followup.find({}).lean();
  console.log(`Total StaffFollowup docs: ${allFollowups.length}`);

  let fixed = 0;
  let already = 0;
  let errors = 0;

  for (const f of allFollowups) {
    try {
      const customerId = (f.customerId as any).toString();
      const currentSpId = (f.salespersonId as any).toString();

      const customer = await Customer.findById(customerId).lean();
      if (!customer) {
        console.log(`WARN: No customer found for followup ${(f._id as any).toString()}`);
        continue;
      }

      const correctSpId = (customer.createdBy as any).toString();

      if (currentSpId !== correctSpId) {
        await Followup.findByIdAndUpdate(f._id, { salespersonId: new mongoose.Types.ObjectId(correctSpId) });
        console.log(`FIXED: followup ${(f._id as any).toString()}: ${currentSpId} => ${correctSpId}`);
        fixed++;
      } else {
        console.log(`OK: followup ${(f._id as any).toString()} sp=${currentSpId}`);
        already++;
      }
    } catch (e: any) {
      console.log(`ERR: ${e.message}`);
      errors++;
    }
  }

  console.log(`\nfixed=${fixed} already_correct=${already} errors=${errors}`);

  // Also create followups for customers with followupDate but NO followup doc
  const allCustomers = await Customer.find({ followupDate: { $exists: true, $ne: null } }).lean();
  for (const c of allCustomers) {
    const cid = (c._id as any).toString();
    const existing = await Followup.findOne({ customerId: cid }).lean();
    if (!existing) {
      const spId = (c.createdBy as any).toString();
      await Followup.create({
        customerId: cid,
        salespersonId: spId,
        followupDate: c.followupDate,
        followupTime: c.followupTime || '09:00',
        message: 'Auto-created from customer',
        status: 'pending',
        history: [{ message: 'Auto-created from customer', status: 'pending', followupDate: c.followupDate, followupTime: c.followupTime || '09:00', recordedAt: new Date() }],
      });
      console.log(`CREATED new followup for customer: ${c.name}`);
    }
  }

  process.exit(0);
})();
