import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { assignSubscriptionToOutlet } from '../utils/subscriptionUtils.js';

dotenv.config();

const getArg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const outletId = getArg('outletId');
const plan = (getArg('plan') || 'basic') as 'free' | 'basic' | 'premium' | 'enterprise';
const status = (getArg('status') || 'active') as 'active' | 'inactive' | 'trial' | 'expired';
const daysRaw = getArg('days');
const notes = getArg('notes') || 'Manual subscription set via script';

function computeEndDate(): Date | undefined {
  if (!daysRaw) return undefined;
  const days = Number.parseInt(daysRaw, 10);
  if (!Number.isFinite(days) || days <= 0) return undefined;
  const end = new Date();
  end.setDate(end.getDate() + days);
  return end;
}

async function main() {
  if (!outletId) throw new Error('Missing required arg: --outletId=<id>');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(process.env.MONGODB_URI);

  const end_date = computeEndDate();

  const sub = await assignSubscriptionToOutlet(outletId, {
    plan,
    status,
    start_date: new Date(),
    end_date,
    notes,
  });

  console.log(
    JSON.stringify(
      {
        outletId,
        subscriptionId: sub._id.toString(),
        plan: sub.plan,
        status: sub.status,
        end_date: sub.end_date?.toISOString() || null,
      },
      null,
      2
    )
  );

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
