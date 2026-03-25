import { ParsedEvent } from './analyticsSchemaParser.js';
import { fallbackStorage } from './analyticsFallbackStorage.js';
import { FoodItemProcessor } from './analytics/processor/FoodItemProcessor.js';
import { OutletProcessor } from './analytics/processor/OutletProcessor.js';
import { PromotionProcessor } from './analytics/processor/PromotionProcessor.js';
import { OfferProcessor } from './analytics/processor/OfferProcessor.js';
import { SessionProcessor } from './analytics/processor/SessionProcessor.js';
import { EventCategorizer } from './analytics/processor/EventCategorizer.js';

export class AnalyticsEventProcessor {
    private processedHashes: Set<string> = new Set();
    private readonly MAX_HASH_CACHE = 10000;

    /**
     * Process events with guaranteed no-failure path
     * Returns: { success: number, failed: number, duplicates: number }
     */
    public async processEvents(events: ParsedEvent[]): Promise<{
        success: number;
        failed: number;
        duplicates: number;
        errors: string[];
    }> {
        let successCount = 0;
        let failedCount = 0;
        let duplicateCount = 0;
        const errors: string[] = [];

        for (const event of events) {
            try {
                if (this.isDuplicate(event.event_hash)) {
                    duplicateCount++;
                    continue;
                }

                const success = await this.processEvent(event);

                if (success) {
                    successCount++;
                    this.markProcessed(event.event_hash);
                } else {
                    failedCount++;
                }
            } catch (error: any) {
                failedCount++;
                errors.push(`Event ${event.type}: ${error.message}`);
                console.error('[EventProcessor] Event processing error:', error);

                // GUARANTEED FALLBACK: Save to file storage
                await fallbackStorage.writeEvent(event, `processing_error: ${error.message}`);
            }
        }

        return { success: successCount, failed: failedCount, duplicates: duplicateCount, errors };
    }

    /**
     * Process single event with multiple fallback paths
     */
    private async processEvent(event: ParsedEvent): Promise<boolean> {
        try {
            const category = EventCategorizer.categorize(event.type);

            switch (category) {
                case 'food_item':
                    return await FoodItemProcessor.process(event);
                case 'outlet':
                    return await OutletProcessor.process(event);
                case 'promotion':
                    return await PromotionProcessor.process(event);
                case 'offer':
                    return await OfferProcessor.process(event);
                case 'session_lifecycle':
                    return await SessionProcessor.process(event);
                default:
                    console.log('[EventProcessor] Unknown event type:', event.type);
                    return true;
            }
        } catch (error: any) {
            console.error('[EventProcessor] Failed to process event:', error);
            await fallbackStorage.writeEvent(event, `db_error: ${error.message}`);
            return true;
        }
    }

    private isDuplicate(eventHash: string): boolean {
        return this.processedHashes.has(eventHash);
    }

    private markProcessed(eventHash: string): void {
        this.processedHashes.add(eventHash);

        if (this.processedHashes.size > this.MAX_HASH_CACHE) {
            const toRemove = Math.floor(this.MAX_HASH_CACHE * 0.2);
            const iterator = this.processedHashes.values();

            for (let i = 0; i < toRemove; i++) {
                const value = iterator.next().value;
                if (value) this.processedHashes.delete(value);
            }
        }
    }

    public clearCache(): void {
        this.processedHashes.clear();
    }
}

export const eventProcessor = new AnalyticsEventProcessor();
