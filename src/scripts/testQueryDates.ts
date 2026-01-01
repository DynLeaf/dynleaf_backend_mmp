import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { PromotionAnalyticsSummary } from '../models/PromotionAnalyticsSummary.js';

dotenv.config();

async function testQuery() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to MongoDB\n');

        const promotionId = '6956acd254f72fb2faa5b45e';
        
        // Test with different date ranges
        console.log('Testing different date ranges:\n');
        
        // Last 30 days from now
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        console.log(`1. Last 30 days: ${thirtyDaysAgo.toISOString()} to ${now.toISOString()}`);
        const result1 = await PromotionAnalyticsSummary.find({
            promotion_id: promotionId,
            date: { $gte: thirtyDaysAgo, $lte: now }
        }).sort({ date: 1 });
        console.log(`   Found: ${result1.length} summaries`);
        result1.forEach(s => console.log(`   - ${s.date.toISOString().split('T')[0]}: ${s.metrics.impressions} impressions`));
        
        // All summaries for this promotion
        console.log(`\n2. All summaries for promotion ${promotionId}:`);
        const result2 = await PromotionAnalyticsSummary.find({
            promotion_id: promotionId
        }).sort({ date: 1 });
        console.log(`   Found: ${result2.length} summaries`);
        result2.forEach(s => console.log(`   - ${s.date.toISOString()} (${s.date.toISOString().split('T')[0]}): ${s.metrics.impressions} impressions`));
        
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
        
    } catch (error) {
        console.error('Error:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

testQuery();
