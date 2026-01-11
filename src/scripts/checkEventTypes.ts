import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const PromotionEvent = mongoose.model('PromotionEvent', new mongoose.Schema({ event_type: String }, { strict: false }));
    const stats = await PromotionEvent.aggregate([{ $group: { _id: '$event_type', count: { $sum: 1 } } }]);
    console.log('Event stats:', stats);
    await mongoose.disconnect();
}

run();
