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

        // Get unique promotion IDs from events
        const promoIds = await PromotionEvent.distinct('promotion_id');

        for (const id of promoIds) {
            const eventCount = await PromotionEvent.countDocuments({ promotion_id: id });
            const impressionCount = await PromotionEvent.countDocuments({ promotion_id: id, event_type: 'impression' });
            const clickCount = await PromotionEvent.countDocuments({ promotion_id: id, event_type: 'click' });

            const promo = await FeaturedPromotion.findById(id);

            if (promo) {

                if (promo.analytics?.impressions !== impressionCount || promo.analytics?.clicks !== clickCount) {
                }
            }
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkAnalytics();
