import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const PromotionEvent = mongoose.model('PromotionEvent', new mongoose.Schema({
    promotion_id: mongoose.Types.ObjectId,
    event_type: String
}, { strict: false }));

const FeaturedPromotion = mongoose.model('FeaturedPromotion', new mongoose.Schema({
    analytics: {
        impressions: Number,
        clicks: Number
    }
}, { strict: false }));

async function sync() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const promos = await FeaturedPromotion.find();

    for (const promo of promos) {
        const impressions = await PromotionEvent.countDocuments({ promotion_id: promo._id, event_type: 'impression' });
        const clicks = await PromotionEvent.countDocuments({ promotion_id: promo._id, event_type: 'click' });

        console.log(`Syncing ${promo._id}: Imp=${impressions}, Clicks=${clicks}`);

        await FeaturedPromotion.findByIdAndUpdate(promo._id, {
            $set: {
                'analytics.impressions': impressions,
                'analytics.clicks': clicks
            }
        });
    }

    await mongoose.disconnect();
}

sync();
