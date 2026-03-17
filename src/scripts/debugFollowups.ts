import 'dotenv/config';
import connectDB from '../config/db.js';
import { Customer } from '../modules/staff/models/Customer.js';
import { Followup } from '../modules/staff/models/Followup.js';

(async () => {
  await connectDB();

  const customers = await Customer.find({}).select('name followupRequired followupDate followupTime createdBy').lean();
  console.log('=== CUSTOMERS ===');
  customers.forEach(c => {
    const cid = (c._id as any).toString();
    const sp = (c.createdBy as any).toString();
    console.log(`[${cid}] ${c.name} | sp=${sp} | req=${c.followupRequired} | date=${c.followupDate?.toISOString().slice(0,10)} | time=${c.followupTime}`);
  });

  const followups = await Followup.find({}).select('customerId salespersonId followupDate followupTime status').lean();
  console.log('\n=== STAFF FOLLOWUPS ===');
  console.log(`Total: ${followups.length}`);
  followups.forEach(f => {
    const cid = (f.customerId as any).toString();
    const sp = (f.salespersonId as any).toString();
    console.log(`cust=${cid} | sp=${sp} | date=${(f.followupDate as Date)?.toISOString().slice(0,10)} | time=${f.followupTime} | status=${f.status}`);
  });

  process.exit(0);
})();
