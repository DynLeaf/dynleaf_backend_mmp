import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { PromotionEvent } from '../models/PromotionEvent.js';
import { PromotionAnalyticsSummary } from '../models/PromotionAnalyticsSummary.js';
import { FeaturedPromotion } from '../models/FeaturedPromotion.js';

dotenv.config();

async function debugAnalytics() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('Connected to MongoDB\n');

    // 1. Check promotions
    const promotions = await FeaturedPromotion.find({});
    console.log(`📊 Total Promotions: ${promotions.length}`);
    promotions.forEach(p => {
      console.log(`  - ${p._id}: ${p.display_data.title} (active: ${p.is_active})`);
    });

    // 2. Check events
    const events = await PromotionEvent.find({}).sort({ timestamp: -1 }).limit(10);
    console.log(`\n📍 Recent Events: ${events.length}`);
    events.forEach(e => {
      console.log(`  - ${e.event_type} at ${e.timestamp.toISOString()} (promo: ${e.promotion_id})`);
    });

    // Get event counts by promotion
    const eventCounts = await PromotionEvent.aggregate([
      {
        $group: {
          _id: { promotion_id: '$promotion_id', event_type: '$event_type' },
          count: { $sum: 1 }
        }
      }
    ]);
    console.log(`\n📈 Event Counts by Promotion:`);
    eventCounts.forEach(ec => {
      console.log(`  - Promotion ${ec._id.promotion_id}: ${ec._id.event_type} = ${ec.count}`);
    });

    // 3. Check summaries
    const summaries = await PromotionAnalyticsSummary.find({}).sort({ date: -1 });
    console.log(`\n📊 Analytics Summaries: ${summaries.length}`);
    summaries.forEach(s => {
      console.log(`  - ${s.date.toISOString().split('T')[0]}: Promo ${s.promotion_id} - ${s.metrics.impressions} impressions, ${s.metrics.clicks} clicks (CTR: ${s.metrics.ctr}%)`);
    });

    // 4. Test API query params
    const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = new Date();
    console.log(`\n🔍 Testing date range query:`);
    console.log(`  From: ${dateFrom.toISOString()}`);
    console.log(`  To: ${dateTo.toISOString()}`);

    const matchingSummaries = await PromotionAnalyticsSummary.find({
      date: { $gte: dateFrom, $lte: dateTo }
    });
    console.log(`  Matching summaries: ${matchingSummaries.length}`);

    // 5. Check if aggregation would work
    console.log(`\n🔧 Testing aggregation logic:`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    console.log(`  Today range: ${today.toISOString()} to ${tomorrow.toISOString()}`);

    const todayEvents = await PromotionEvent.find({
      timestamp: { $gte: today, $lt: tomorrow }
    });
    console.log(`  Events today: ${todayEvents.length}`);

    if (todayEvents.length > 0) {
      console.log(`  Event timestamps:`);
      todayEvents.forEach(e => {
        console.log(`    - ${e.timestamp.toISOString()} (${e.event_type})`);
      });
    }

    await mongoose.disconnect();
    console.log('\n✅ Debug complete');

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

debugAnalytics();
