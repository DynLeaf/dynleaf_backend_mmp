/**
 * Manual Script: Process Pending Analytics Events
 * Immediately processes all pending fallback events
 */

import { fallbackStorage } from '../services/analyticsFallbackStorage.js';
import { eventProcessor } from '../services/analyticsEventProcessor.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf';

async function processPendingEvents() {
    try {
        console.log('🔄 Processing pending analytics events...\n');

        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Initialize fallback storage
        await fallbackStorage.initialize();

        // Get pending events
        const pendingEvents = await fallbackStorage.getPendingEvents(100);

        if (pendingEvents.length === 0) {
            console.log('✨ No pending events to process!');
            return;
        }

        console.log(`📦 Found ${pendingEvents.length} pending event(s)\n`);

        let successCount = 0;
        let failedCount = 0;
        let duplicateCount = 0;

        for (const { event, filepath, retryCount } of pendingEvents) {
            try {
                console.log(`Processing event: ${event.type} (${event.event_hash.substring(0, 8)}...)`);
                console.log(`  Retry count: ${retryCount}`);
                console.log(`  File: ${filepath.split('\\').pop()}`);

                // Try to process the event
                const result = await eventProcessor.processEvents([event]);

                if (result.success > 0) {
                    await fallbackStorage.markProcessed(filepath);
                    successCount++;
                    console.log(`  ✅ Processed successfully\n`);
                } else if (result.duplicates > 0) {
                    await fallbackStorage.markProcessed(filepath);
                    duplicateCount++;
                    console.log(`  ℹ️  Already processed (duplicate)\n`);
                } else {
                    failedCount++;
                    console.log(`  ❌ Failed to process\n`);
                }
            } catch (error: any) {
                console.error(`  ❌ Error: ${error.message}\n`);
                failedCount++;
            }
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 Summary:');
        console.log(`   ✅ Success: ${successCount}`);
        console.log(`   ℹ️  Duplicates: ${duplicateCount}`);
        console.log(`   ❌ Failed: ${failedCount}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Clean up old processed files
        if (successCount > 0 || duplicateCount > 0) {
            console.log('🧹 Cleaning up old processed files...');
            await fallbackStorage.cleanup(7);
            console.log('✅ Cleanup completed\n');
        }

    } catch (error) {
        console.error('❌ Processing failed:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

processPendingEvents()
    .then(() => {
        console.log('\n✨ All done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });
