import mongoose from 'mongoose';
import * as outletRepo from '../repositories/outletRepository.js';
import * as outletAnalyticsEventRepo from '../repositories/analytics/outletAnalyticsEventRepository.js';
import * as outletInsightsSummaryRepo from '../repositories/analytics/outletInsightsSummaryRepository.js';
import type { IOutletInsightsSummary } from '../types/analytics.js';
import { TimeHelper } from './analytics/computation/TimeHelper.js';
import { MetricComputers } from './analytics/computation/MetricComputers.js';
import { TrendComputer } from './analytics/computation/TrendComputer.js';

/**
 * Service for computing outlet insights
 * Designed for cron job execution with batch processing
 * Supports: 7d, 30d, 90d (pre-computed) + today (on-demand for premium)
 */

import { TimeRange } from './analytics/computation/types.js';

interface ComputationResult {
    success: boolean;
    outletId: string;
    timeRange: TimeRange | string;
    duration: number;
    error?: string;
}

export class InsightsComputationService {
    /**
     * Compute insights for a single outlet and time range
     */
    static async computeForOutlet(
        outletId: string,
        timeRange: TimeRange = '7d',
        customStart?: string,
        customEnd?: string
    ): Promise<ComputationResult> {
        const startTime = Date.now();

        try {
            const outletObjectId = new mongoose.Types.ObjectId(outletId);

            // Verify outlet exists
            const outlet = await outletRepo.findById(outletObjectId.toString());
            if (!outlet) {
                throw new Error(`Outlet ${outletId} not found`);
            }

            // Calculate time periods
            const { currentPeriod, previousPeriod } = TimeHelper.getTimePeriods(timeRange, customStart, customEnd);

            // Compute all metrics in parallel
            const [basicMetrics, premiumMetrics, trends] = await Promise.all([
                MetricComputers.computeBasicMetrics(outletObjectId, currentPeriod),
                MetricComputers.computePremiumMetrics(outletObjectId, currentPeriod),
                TrendComputer.computeTrends(outletObjectId, currentPeriod, previousPeriod),
            ]);

            // Save to database
            const summary: Partial<IOutletInsightsSummary> = {
                outlet_id: outletObjectId,
                time_range: timeRange,
                computed_at: new Date(),
                period_start: currentPeriod.start,
                period_end: currentPeriod.end,
                ...basicMetrics,
                premium_data: premiumMetrics,
                trends,
                computation_duration_ms: Date.now() - startTime,
                events_processed: basicMetrics.events_processed || 0,
                status: 'success',
            };

            await outletInsightsSummaryRepo.findOneAndUpdate(
                { outlet_id: outletObjectId, time_range: timeRange },
                summary,
                { upsert: true, new: true }
            );

            return { success: true, outletId, timeRange, duration: Date.now() - startTime };
        } catch (error: any) {
            const duration = Date.now() - startTime;
            console.error(`[Insights] ❌ Failed to compute ${timeRange} for outlet ${outletId}:`, error);

            try {
                await outletInsightsSummaryRepo.findOneAndUpdate(
                    { outlet_id: new mongoose.Types.ObjectId(outletId), time_range: timeRange },
                    {
                        status: 'failed',
                        error_message: error.message,
                        computed_at: new Date(),
                        computation_duration_ms: duration,
                    },
                    { upsert: true }
                );
            } catch (saveError) {
                console.error('[Insights] Failed to save error status:', saveError);
            }

            return { success: false, outletId, timeRange, duration, error: error.message };
        }
    }

    /**
     * Compute insights for multiple outlets in batches
     */
    static async computeForOutlets(
        outletIds: string[],
        timeRange: TimeRange = '7d',
        batchSize: number = 10
    ): Promise<ComputationResult[]> {
        const results: ComputationResult[] = [];

        for (let i = 0; i < outletIds.length; i += batchSize) {
            const batch = outletIds.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map((outletId) => this.computeForOutlet(outletId, timeRange))
            );
            results.push(...batchResults);
            if (i + batchSize < outletIds.length) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
        return results;
    }

    /**
     * Compute insights for all active outlets
     */
    static async computeForAllActiveOutlets(timeRange: TimeRange = '7d'): Promise<ComputationResult[]> {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const activeOutletIds = await outletAnalyticsEventRepo.distinctEvents('outlet_id', {
            timestamp: { $gte: ninetyDaysAgo },
        });

        return this.computeForOutlets(
            activeOutletIds.map((id: any) => id.toString()),
            timeRange
        );
    }
}
