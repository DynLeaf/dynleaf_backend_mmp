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

        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);

        // Initialize fallback storage
        await fallbackStorage.initialize();

        // Get pending events
        const pendingEvents = await fallbackStorage.getPendingEvents(100);

        if (pendingEvents.length === 0) {
            return;
        }


        let successCount = 0;
        let failedCount = 0;
        let duplicateCount = 0;

        for (const { event, filepath, retryCount } of pendingEvents) {
            try {


                // Try to process the event
                const result = await eventProcessor.processEvents([event]);

                if (result.success > 0) {
                    await fallbackStorage.markProcessed(filepath);
                    successCount++;
                } else if (result.duplicates > 0) {
                    await fallbackStorage.markProcessed(filepath);
                    duplicateCount++;
                } else {
                    failedCount++;
                }
            } catch (error: any) {
                failedCount++;
            }
        }



        // Clean up old processed files
        if (successCount > 0 || duplicateCount > 0) {
            await fallbackStorage.cleanup(7);
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
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });
