// Quick script to delete stale "today" and "custom" insights data
// Run with: node cleanup-stale-insights.js

const mongoose = require('mongoose');
require('dotenv').config();

async function cleanup() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Get the model
        const OutletInsightsSummary = mongoose.model('OutletInsightsSummary', new mongoose.Schema({}, { strict: false }), 'outletinsightssummaries');

        // Delete all "today" and "custom" data
        const result = await OutletInsightsSummary.deleteMany({
            time_range: { $in: ['today', 'custom'] }
        });


        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

cleanup();
