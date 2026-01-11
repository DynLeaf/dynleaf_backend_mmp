import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const PromotionEventSchema = new mongoose.Schema({
    promotion_id: mongoose.Schema.Types.ObjectId,
    event_type: String,
    timestamp: Date,
}, { strict: false });

const FeaturedPromotionSchema = new mongoose.Schema({
    analytics: {
        impressions: Number,
        clicks: Number
    }
}, { strict: false });

const PromotionEvent = mongoose.model('PromotionEvent', PromotionEventSchema);
const FeaturedPromotion = mongoose.model('FeaturedPromotion', FeaturedPromotionSchema);

async function checkAnalytics() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('Connected to MongoDB');

        // Get unique promotion IDs from events
        const promoIds = await PromotionEvent.distinct('promotion_id');
        console.log(`Found ${promoIds.length} promotion(s) with events.`);

        for (const id of promoIds) {
            const eventCount = await PromotionEvent.countDocuments({ promotion_id: id });
            const impressionCount = await PromotionEvent.countDocuments({ promotion_id: id, event_type: 'impression' });
            const clickCount = await PromotionEvent.countDocuments({ promotion_id: id, event_type: 'click' });

            const promo = await FeaturedPromotion.findById(id);

            console.log(`\nPromotion ID: ${id}`);
            console.log(`- Events in DB: ${eventCount} (Imp: ${impressionCount}, Click: ${clickCount})`);
            if (promo) {
                console.log(`- FeaturedPromotion Counters: Impressions: ${promo.analytics?.impressions}, Clicks: ${promo.analytics?.clicks}`);

                if (promo.analytics?.impressions !== impressionCount || promo.analytics?.clicks !== clickCount) {
                    console.log(`!!! MISMATCH DETECTED !!!`);
                } else {
                    console.log(`✓ Counters match event logs.`);
                }
            } else {
                console.log(`- FeaturedPromotion document NOT FOUND in DB!`);
            }
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkAnalytics();
