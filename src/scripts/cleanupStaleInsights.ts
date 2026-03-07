import { OutletInsightsSummary } from './models/OutletInsightsSummary.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Cleanup script to delete stale "today" and "custom" insights
 * These should always be computed fresh, never cached
 */
async function cleanupStaleInsights() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!);

        const result = await OutletInsightsSummary.deleteMany({
            time_range: { $in: ['today', 'custom'] }
        });


        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

cleanupStaleInsights();
