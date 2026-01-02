import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Outlet } from '../models/Outlet.js';
import { Subscription } from '../models/Subscription.js';

dotenv.config();

const outletIdArg = process.argv.find((a) => a.startsWith('--outletId='))?.split('=')[1];

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(process.env.MONGODB_URI);

  const outlets = outletIdArg
    ? await Outlet.find({ _id: outletIdArg }).select('_id name subscription_id')
    : await Outlet.find({}).select('_id name subscription_id').limit(50);

  const allowedPlans = new Set(['basic', 'premium', 'enterprise']);
  const allowedStatuses = new Set(['active', 'trial']);

  for (const outlet of outlets) {
    const byLink = outlet.subscription_id
      ? await Subscription.findById(outlet.subscription_id).select('_id plan status created_at updated_at')
      : null;

    const byOutlet = await Subscription.findOne({ outlet_id: outlet._id })
      .sort({ updated_at: -1, created_at: -1 })
      .select('_id plan status created_at updated_at');

    // Controller logic prefers the latest subscription by outlet_id.
    const chosen = byOutlet || byLink;

    const isAllowed = !!chosen && allowedPlans.has(chosen.plan) && allowedStatuses.has(chosen.status);

    console.log(
      JSON.stringify(
        {
          outlet: { id: outlet._id.toString(), name: outlet.name, subscription_id: outlet.subscription_id?.toString() },
          subscription_by_link: byLink
            ? { id: byLink._id.toString(), plan: byLink.plan, status: byLink.status }
            : null,
          subscription_by_outlet_latest: byOutlet
            ? { id: byOutlet._id.toString(), plan: byOutlet.plan, status: byOutlet.status }
            : null,
          analytics_allowed: isAllowed,
        },
        null,
        2
      )
    );
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
