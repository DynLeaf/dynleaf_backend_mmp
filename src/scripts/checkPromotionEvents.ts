import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const PromotionEventSchema = new mongoose.Schema({
    promotion_id: mongoose.Schema.Types.ObjectId,
    outlet_id: mongoose.Schema.Types.ObjectId,
    event_type: String,
    session_id: String,
    timestamp: Date,
}, { strict: false });

const PromotionEvent = mongoose.model('PromotionEvent', PromotionEventSchema);

async function checkEvents() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('Connected to MongoDB');

        const count = await PromotionEvent.countDocuments();
        console.log(`Total PromotionEvents: ${count}`);

        const recent = await PromotionEvent.find().sort({ timestamp: -1 }).limit(5);
        console.log('Recent events:', JSON.stringify(recent, null, 2));

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkEvents();
