/**
 * Backfill script v2: creates StaffFollowup documents for every Customer
 * that has followupDate set (regardless of followupRequired flag).
 * This covers cases where followupRequired may not be set but date/time exist.
 *
 * Run with:  npx tsx src/scripts/backfillCustomerFollowups.ts
 */
import 'dotenv/config';
import connectDB from '../config/db.js';
import { Customer } from '../modules/staff/models/Customer.js';
import { Followup } from '../modules/staff/models/Followup.js';

const backfill = async () => {
  await connectDB();
  console.log('Connected to DB');

  // Find ALL customers with followupDate set — regardless of followupRequired flag
  const customers = await Customer.find({
    followupDate: { $exists: true, $ne: null },
    followupTime: { $exists: true, $ne: null },
  }).lean();

  console.log(`Found ${customers.length} customers with followup date/time`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const customer of customers) {
    try {
      const customerId = (customer._id as any).toString();
      const salespersonId = (customer.createdBy as any).toString();

      // Check if a StaffFollowup already exists for this customer
      const existing = await Followup.findOne({ customerId }).lean();
      if (existing) {
        console.log(`  ⟳ Skipped ${customer.name} — followup already exists`);
        skipped++;
        continue;
      }

      const followupDate = customer.followupDate!;
      const followupTime = customer.followupTime!;

      await Followup.create({
        customerId,
        salespersonId,
        followupDate,
        followupTime,
        message: 'Backfilled from customer record',
        status: 'pending',
        history: [
          {
            message: 'Backfilled from customer record',
            status: 'pending',
            followupDate,
            followupTime,
            recordedAt: customer.createdAt || new Date(),
          },
        ],
      });

      created++;
      console.log(`  ✓ Created followup for: ${customer.name} — ${followupDate} at ${followupTime}`);
    } catch (err: any) {
      errors++;
      console.error(`  ✗ Error for customer ${(customer._id as any).toString()}: ${err.message}`);
    }
  }

  console.log(`\nDone! created=${created}  skipped=${skipped}  errors=${errors}`);
  process.exit(0);
};

backfill().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
