/**
 * Fix script: checks and corrects salespersonId mismatches in StaffFollowup.
 * Also creates missing followups for customers that have none.
 *
 * Run with:  npx tsx src/scripts/fixFollowupSalesperson.ts
 */
import 'dotenv/config';
import connectDB from '../config/db.js';
import { Customer } from '../modules/staff/models/Customer.js';
import { Followup } from '../modules/staff/models/Followup.js';

(async () => {
  await connectDB();
  console.log('=== FIX FOLLOWUP SALESPERSON ===\n');

  // Show all customers
  const customers = await Customer.find({
    followupDate: { $exists: true, $ne: null },
  }).lean();

  console.log(`Customers with followupDate: ${customers.length}`);
  for (const c of customers) {
    const cid = (c._id as any).toString();
    const correctSp = (c.createdBy as any).toString();
    console.log(`\nCustomer: ${c.name} [${cid}]`);
    console.log(`  Expected salespersonId: ${correctSp}`);
    console.log(`  followupDate: ${c.followupDate?.toISOString().slice(0,10)} at ${c.followupTime}`);

    // Find ALL followups for this customer
    const fups = await Followup.find({ customerId: cid }).lean();
    if (fups.length === 0) {
      console.log(`  ⚠ No StaffFollowup found — creating...`);
      await Followup.create({
        customerId: cid,
        salespersonId: correctSp,
        followupDate: c.followupDate,
        followupTime: c.followupTime,
        message: 'Auto-created from customer record',
        status: 'pending',
        history: [{
          message: 'Auto-created from customer record',
          status: 'pending',
          followupDate: c.followupDate,
          followupTime: c.followupTime,
          recordedAt: new Date(),
        }],
      });
      console.log(`  ✓ Created`);
    } else {
      for (const f of fups) {
        const fSp = (f.salespersonId as any).toString();
        console.log(`  Followup [${(f._id as any).toString()}]: salespersonId=${fSp} status=${f.status}`);
        if (fSp !== correctSp) {
          console.log(`  ⚠ salespersonId MISMATCH! Fixing ${fSp} → ${correctSp}`);
          await Followup.findByIdAndUpdate(f._id, { salespersonId: correctSp });
          console.log(`  ✓ Fixed`);
        } else {
          console.log(`  ✓ salespersonId correct`);
        }
      }
    }
  }

  // Also show all followups to see what's in DB
  const allFups = await Followup.find({}).lean();
  console.log(`\n=== ALL STAFF FOLLOWUPS (${allFups.length} total) ===`);
  for (const f of allFups) {
    console.log(`  [${(f._id as any).toString()}] cust=${(f.customerId as any).toString()} sp=${(f.salespersonId as any).toString()} date=${(f.followupDate as Date)?.toISOString().slice(0,10)} time=${f.followupTime} status=${f.status}`);
  }

  console.log('\nDone!');
  process.exit(0);
})();
