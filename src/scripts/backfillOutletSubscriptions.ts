import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Outlet } from '../models/Outlet.js';
import { Subscription, SubscriptionHistory } from '../models/Subscription.js';
import { ensureSubscriptionForOutlet } from '../utils/subscriptionUtils.js';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const DEDUPE = process.argv.includes('--dedupe');

const MIXED_PLANS = ['free', 'basic', 'premium'] as const;
type MixedPlan = (typeof MIXED_PLANS)[number];

function pickMixedPlan(outletId: string): MixedPlan {
  // Deterministic: stable distribution without storing extra state
  // Use last 6 hex chars of ObjectId to spread reasonably.
  const hex = outletId.replace(/[^a-fA-F0-9]/g, '').slice(-6);
  const n = parseInt(hex || '0', 16);
  return MIXED_PLANS[n % MIXED_PLANS.length];
}

function getEndDateForPlan(plan: MixedPlan, now: Date): Date | undefined {
  if (plan === 'free') return undefined;
  const end = new Date(now);
  end.setDate(end.getDate() + 365);
  return end;
}

async function dedupeSubscriptionsByOutletId() {
  const dupGroups = await Subscription.aggregate([
    {
      $group: {
        _id: '$outlet_id',
        count: { $sum: 1 },
        ids: { $push: '$_id' },
        updated_ats: { $push: '$updated_at' },
        created_ats: { $push: '$created_at' }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);

  if (dupGroups.length === 0) {
    console.log('✅ No duplicate subscriptions found');
    return;
  }

  console.log(`⚠️  Found ${dupGroups.length} outlets with duplicate subscriptions`);
  for (const g of dupGroups) {
    console.log(`   Outlet ${g._id}: ${g.count} subscriptions`);
  }

  if (!APPLY || !DEDUPE) {
    console.log('\nDry run: duplicates were not modified.');
    console.log('Re-run with `--apply --dedupe` to merge duplicates safely.');
    return;
  }

  console.log('\n🧹 Dedupe mode enabled: merging duplicates...');

  for (const group of dupGroups) {
    const outletId = group._id;

    const subs = await Subscription.find({ outlet_id: outletId })
      .select('_id created_at updated_at')
      .sort({ updated_at: -1, created_at: -1 });

    if (subs.length < 2) continue;

    const keep = subs[0];
    const remove = subs.slice(1);

    console.log(`\n🔁 Outlet ${outletId}: keeping ${keep._id}, removing ${remove.length} duplicates`);

    // Move history entries to kept subscription
    await SubscriptionHistory.updateMany(
      { subscription_id: { $in: remove.map((s) => s._id) } },
      { $set: { subscription_id: keep._id } }
    );

    // Ensure Outlet points to kept subscription
    await Outlet.updateOne({ _id: outletId }, { $set: { subscription_id: keep._id } });

    // Remove duplicate subscription docs
    await Subscription.deleteMany({ _id: { $in: remove.map((s) => s._id) } });
  }

  console.log('\n✅ Dedupe complete');
}

async function backfillMissingSubscriptions() {
  const outlets = await Outlet.find({}).select('_id name subscription_id');
  console.log(`\n📦 Scanning ${outlets.length} outlets for subscriptions...`);

  let wouldCreate = 0;
  let wouldLink = 0;
  let created = 0;
  let linked = 0;
  let ok = 0;

  for (const outlet of outlets) {
    const existingSub = await Subscription.findOne({ outlet_id: outlet._id }).select('_id');

    if (!existingSub) {
      wouldCreate++;
      if (APPLY) {
        const now = new Date();
        const plan = pickMixedPlan(outlet._id.toString());
        await ensureSubscriptionForOutlet(outlet._id.toString(), {
          plan,
          status: 'active',
          end_date: getEndDateForPlan(plan, now),
          notes: `Backfilled subscription (${plan})`
        });
        created++;
      }
      continue;
    }

    if (!outlet.subscription_id || outlet.subscription_id.toString() !== existingSub._id.toString()) {
      wouldLink++;
      if (APPLY) {
        outlet.subscription_id = existingSub._id;
        await outlet.save();
        linked++;
      }
      continue;
    }

    ok++;
  }

  console.log('\nResults');
  console.log(`- Outlets OK: ${ok}`);
  console.log(`- Missing subscriptions: ${wouldCreate}${APPLY ? ` (created ${created})` : ''}`);
  console.log(`- Missing outlet links: ${wouldLink}${APPLY ? ` (linked ${linked})` : ''}`);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with `--apply` to make changes.');
  }
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }

  console.log('🚀 Backfill Outlet Subscriptions');
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}${APPLY ? (DEDUPE ? ' + DEDUPE' : '') : ''}`);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  await dedupeSubscriptionsByOutletId();
  await backfillMissingSubscriptions();

  await mongoose.disconnect();
  console.log('\n✅ Done');
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
