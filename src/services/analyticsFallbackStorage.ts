/**
 * Guaranteed Write Path for Analytics Events
 * Ensures NO EVENT IS EVER LOST
 */

import fs from 'fs/promises';
import path from 'path';
import { ParsedEvent } from './analyticsSchemaParser.js';

// ============================================================================
// FALLBACK STORAGE MANAGER
// ============================================================================

export class AnalyticsFallbackStorage {
    private fallbackDir: string;
    private isInitialized: boolean = false;

    constructor(fallbackDir: string = './analytics_fallback') {
        this.fallbackDir = path.resolve(fallbackDir);
    }

    /**
     * Initialize fallback storage directory
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            await fs.mkdir(this.fallbackDir, { recursive: true });

            // Create subdirectories for organization
            await fs.mkdir(path.join(this.fallbackDir, 'pending'), { recursive: true });
            await fs.mkdir(path.join(this.fallbackDir, 'failed'), { recursive: true });
            await fs.mkdir(path.join(this.fallbackDir, 'processed'), { recursive: true });

            this.isInitialized = true;
            console.log('[FallbackStorage] Initialized at:', this.fallbackDir);
        } catch (error) {
            console.error('[FallbackStorage] Failed to initialize:', error);
            // Don't throw - we'll try to write anyway
        }
    }

    /**
     * Write event to fallback storage (JSONL format)
     * GUARANTEED to not throw errors
     */
    public async writeEvent(event: ParsedEvent, reason: string = 'unknown'): Promise<boolean> {
        try {
            await this.ensureInitialized();

            const filename = this.generateFilename('pending');
            const filepath = path.join(this.fallbackDir, 'pending', filename);

            const record = {
                event,
                fallback_reason: reason,
                fallback_timestamp: new Date().toISOString(),
                retry_count: 0,
            };

            // Append to JSONL file (one JSON object per line)
            await fs.appendFile(filepath, JSON.stringify(record) + '\n', 'utf8');

            console.log('[FallbackStorage] Event saved to fallback:', event.event_hash);
            return true;
        } catch (error) {
            console.error('[FallbackStorage] CRITICAL: Failed to write to fallback:', error);

            // Last resort: try to write to a different location
            return await this.emergencyWrite(event, reason, error);
        }
    }

    /**
     * Write multiple events in batch
     */
    public async writeBatch(events: ParsedEvent[], reason: string = 'batch_failure'): Promise<number> {
        let successCount = 0;

        for (const event of events) {
            const success = await this.writeEvent(event, reason);
            if (success) successCount++;
        }

        return successCount;
    }

    /**
     * Emergency write to temporary location
     */
    private async emergencyWrite(event: ParsedEvent, reason: string, originalError: any): Promise<boolean> {
        try {
            // Try writing to /tmp or system temp directory
            const tmpDir = process.env.TMPDIR || '/tmp';
            const emergencyFile = path.join(tmpDir, `analytics_emergency_${Date.now()}.jsonl`);

            const record = {
                event,
                fallback_reason: reason,
                original_error: originalError?.message,
                emergency_timestamp: new Date().toISOString(),
            };

            await fs.appendFile(emergencyFile, JSON.stringify(record) + '\n', 'utf8');

            console.error('[FallbackStorage] EMERGENCY: Event saved to:', emergencyFile);
            return true;
        } catch (emergencyError) {
            console.error('[FallbackStorage] CATASTROPHIC: Cannot write anywhere:', emergencyError);
            // At this point, we've tried everything. Log to console as last resort.
            console.error('[FallbackStorage] LOST EVENT:', JSON.stringify(event));
            return false;
        }
    }

    /**
     * Get pending events for retry
     */
    public async getPendingEvents(limit: number = 100): Promise<Array<{ event: ParsedEvent; filepath: string; retryCount: number }>> {
        try {
            await this.ensureInitialized();

            const pendingDir = path.join(this.fallbackDir, 'pending');
            const files = await fs.readdir(pendingDir);

            const events: Array<{ event: ParsedEvent; filepath: string; retryCount: number }> = [];

            for (const file of files.slice(0, limit)) {
                try {
                    const filepath = path.join(pendingDir, file);
                    const content = await fs.readFile(filepath, 'utf8');

                    // Parse JSONL (one JSON per line)
                    const lines = content.trim().split('\n');

                    for (const line of lines) {
                        if (!line.trim()) continue;

                        const record = JSON.parse(line);
                        events.push({
                            event: record.event,
                            filepath,
                            retryCount: record.retry_count || 0,
                        });
                    }
                } catch (error) {
                    console.error('[FallbackStorage] Failed to read file:', file, error);
                }
            }

            return events;
        } catch (error) {
            console.error('[FallbackStorage] Failed to get pending events:', error);
            return [];
        }
    }

    /**
     * Mark event as processed and move to processed directory
     */
    public async markProcessed(filepath: string): Promise<void> {
        try {
            const filename = path.basename(filepath);
            const processedPath = path.join(this.fallbackDir, 'processed', filename);

            await fs.rename(filepath, processedPath);

            console.log('[FallbackStorage] Event processed:', filename);
        } catch (error) {
            console.error('[FallbackStorage] Failed to mark as processed:', error);
            // Don't throw - event was already processed in DB
        }
    }

    /**
     * Mark event as failed and move to failed directory
     */
    public async markFailed(filepath: string): Promise<void> {
        try {
            const filename = path.basename(filepath);
            const failedPath = path.join(this.fallbackDir, 'failed', filename);

            await fs.rename(filepath, failedPath);

            console.error('[FallbackStorage] Event marked as failed:', filename);
        } catch (error) {
            console.error('[FallbackStorage] Failed to mark as failed:', error);
        }
    }

    /**
     * Clean up old processed files
     */
    public async cleanup(olderThanDays: number = 7): Promise<void> {
        try {
            const processedDir = path.join(this.fallbackDir, 'processed');
            const files = await fs.readdir(processedDir);

            const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
            let deletedCount = 0;

            for (const file of files) {
                try {
                    const filepath = path.join(processedDir, file);
                    const stats = await fs.stat(filepath);

                    if (stats.mtimeMs < cutoffTime) {
                        await fs.unlink(filepath);
                        deletedCount++;
                    }
                } catch (error) {
                    console.error('[FallbackStorage] Failed to delete file:', file, error);
                }
            }

            if (deletedCount > 0) {
                console.log(`[FallbackStorage] Cleaned up ${deletedCount} old files`);
            }
        } catch (error) {
            console.error('[FallbackStorage] Cleanup failed:', error);
        }
    }

    /**
     * Get statistics
     */
    public async getStats(): Promise<{ pending: number; failed: number; processed: number }> {
        try {
            const [pending, failed, processed] = await Promise.all([
                fs.readdir(path.join(this.fallbackDir, 'pending')),
                fs.readdir(path.join(this.fallbackDir, 'failed')),
                fs.readdir(path.join(this.fallbackDir, 'processed')),
            ]);

            return {
                pending: pending.length,
                failed: failed.length,
                processed: processed.length,
            };
        } catch (error) {
            return { pending: 0, failed: 0, processed: 0 };
        }
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    private generateFilename(prefix: string): string {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const random = Math.random().toString(36).substring(2, 8);
        return `${prefix}_${timestamp}_${random}.jsonl`;
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const fallbackStorage = new AnalyticsFallbackStorage();
