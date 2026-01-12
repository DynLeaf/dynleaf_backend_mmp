/**
 * Background Job: Retry Fallback Events
 * Runs periodically to process events that failed to save to DB
 */

import { fallbackStorage } from '../services/analyticsFallbackStorage.js';
import { eventProcessor } from '../services/analyticsEventProcessor.js';

export class FallbackRetryJob {
    private isRunning: boolean = false;
    private intervalId?: NodeJS.Timeout;
    private readonly RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    private readonly BATCH_SIZE = 100;

    /**
     * Start the background job
     */
    public start(): void {
        if (this.intervalId) {
            console.log('[FallbackRetryJob] Already running');
            return;
        }

        console.log('[FallbackRetryJob] Starting with interval:', this.RETRY_INTERVAL_MS, 'ms');

        // Initialize fallback storage
        fallbackStorage.initialize().catch(err => {
            console.error('[FallbackRetryJob] Failed to initialize fallback storage:', err);
        });

        // Run immediately on start
        this.runRetry();

        // Then run periodically
        this.intervalId = setInterval(() => {
            this.runRetry();
        }, this.RETRY_INTERVAL_MS);
    }

    /**
     * Stop the background job
     */
    public stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
            console.log('[FallbackRetryJob] Stopped');
        }
    }

    /**
     * Run a single retry cycle
     */
    private async runRetry(): Promise<void> {
        if (this.isRunning) {
            console.log('[FallbackRetryJob] Already running, skipping this cycle');
            return;
        }

        this.isRunning = true;

        try {
            console.log('[FallbackRetryJob] Starting retry cycle');

            // Get pending events
            const pendingEvents = await fallbackStorage.getPendingEvents(this.BATCH_SIZE);

            if (pendingEvents.length === 0) {
                console.log('[FallbackRetryJob] No pending events to retry');
                return;
            }

            console.log(`[FallbackRetryJob] Found ${pendingEvents.length} pending events`);

            let successCount = 0;
            let failedCount = 0;
            let skippedCount = 0;

            for (const { event, filepath, retryCount } of pendingEvents) {
                try {
                    // Skip if too many retries
                    if (retryCount >= 5) {
                        await fallbackStorage.markFailed(filepath);
                        skippedCount++;
                        console.log('[FallbackRetryJob] Event exceeded max retries:', event.event_hash);
                        continue;
                    }

                    // Try to process the event
                    const result = await eventProcessor.processEvents([event]);

                    if (result.success > 0) {
                        // Success! Mark as processed
                        await fallbackStorage.markProcessed(filepath);
                        successCount++;
                        console.log('[FallbackRetryJob] Event processed successfully:', event.event_hash);
                    } else {
                        // Failed, will retry next time
                        failedCount++;
                        console.log('[FallbackRetryJob] Event processing failed, will retry:', event.event_hash);
                    }
                } catch (error: any) {
                    console.error('[FallbackRetryJob] Error processing event:', error);
                    failedCount++;
                }
            }

            console.log(`[FallbackRetryJob] Retry cycle completed: ${successCount} success, ${failedCount} failed, ${skippedCount} skipped`);

            // Run cleanup if successful
            if (successCount > 0) {
                await fallbackStorage.cleanup(7); // Clean up files older than 7 days
            }

        } catch (error: any) {
            console.error('[FallbackRetryJob] Retry cycle error:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Get job status
     */
    public getStatus(): { running: boolean; interval_ms: number } {
        return {
            running: !!this.intervalId,
            interval_ms: this.RETRY_INTERVAL_MS,
        };
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const fallbackRetryJob = new FallbackRetryJob();
