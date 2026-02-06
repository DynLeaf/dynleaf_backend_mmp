import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Outlet } from '../models/Outlet.js';
import { OutletAnalyticsEvent } from '../models/OutletAnalyticsEvent.js';
import { OutletAnalyticsSummary } from '../models/OutletAnalyticsSummary.js';

// Load environment variables
dotenv.config();

async function checkDatabase() {
    try {
        console.log('[CHECK] Connecting to MongoDB...');
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf';
        console.log('[CHECK] Connection string:', mongoUri.substring(0, 30) + '...');

        await mongoose.connect(mongoUri);
        console.log('[CHECK] ✓ Connected to MongoDB\n');

        // Check Outlets
        const outletCount = await Outlet.countDocuments();
        console.log(`[CHECK] Outlets collection: ${outletCount} documents`);

        if (outletCount > 0) {
            const sampleOutlet = await Outlet.findOne().select('name slug').lean();
            console.log(`[CHECK] Sample outlet:`, sampleOutlet);
        }

        // Check OutletAnalyticsEvent
        const eventCount = await OutletAnalyticsEvent.countDocuments();
        console.log(`\n[CHECK] OutletAnalyticsEvent collection: ${eventCount} documents`);

        if (eventCount > 0) {
            const sampleEvent = await OutletAnalyticsEvent.findOne().lean();
            console.log(`[CHECK] Sample event:`, {
                outlet_id: sampleEvent?.outlet_id,
                event_type: sampleEvent?.event_type,
                timestamp: sampleEvent?.timestamp,
                source: sampleEvent?.source,
            });

            // Get date range
            const oldestEvent = await OutletAnalyticsEvent.findOne().sort({ timestamp: 1 }).lean();
            const newestEvent = await OutletAnalyticsEvent.findOne().sort({ timestamp: -1 }).lean();
            console.log(`[CHECK] Date range: ${oldestEvent?.timestamp} to ${newestEvent?.timestamp}`);
        }

        // Check OutletAnalyticsSummary
        const summaryCount = await OutletAnalyticsSummary.countDocuments();
        console.log(`\n[CHECK] OutletAnalyticsSummary collection: ${summaryCount} documents`);

        if (summaryCount > 0) {
            const sampleSummary = await OutletAnalyticsSummary.findOne().lean();
            console.log(`[CHECK] Sample summary:`, {
                outlet_id: sampleSummary?.outlet_id,
                date: sampleSummary?.date,
                metrics: sampleSummary?.metrics,
            });
        }

        // Check database name
        const db = mongoose.connection.db;
        console.log(`\n[CHECK] Current database name: ${db?.databaseName}`);

        await mongoose.disconnect();
        console.log('\n[CHECK] Disconnected');
    } catch (error) {
        console.error('[CHECK] Error:', error);
        await mongoose.disconnect();
    }
}

checkDatabase();
