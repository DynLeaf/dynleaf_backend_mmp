import cron from 'node-cron';
import { InsightsComputationService } from './insightsComputationService.js';

/**
 * Cron job scheduler for insights computation
 * Runs every 6 hours: 00:00, 06:00, 12:00, 18:00 UTC
 */

export class InsightsCronService {
    private static jobs: Map<string, cron.ScheduledTask> = new Map();
    private static isRunning: boolean = false;

    /**
     * Start all cron jobs
     */
    static start() {
        console.log('[InsightsCron] Starting cron jobs...');

        // Every 6 hours for 7-day insights (00:00, 06:00, 12:00, 18:00 UTC)
        const job7d = cron.schedule(
            '0 */6 * * *',
            async () => {
                await this.runComputation('7d');
            },
            {
                timezone: 'UTC',
            }
        );

        // Daily at 01:00 UTC for 30-day insights
        const job30d = cron.schedule(
            '0 1 * * *',
            async () => {
                await this.runComputation('30d');
            },
            {
                timezone: 'UTC',
            }
        );

        // Weekly on Sunday at 02:00 UTC for 90-day insights
        const job90d = cron.schedule(
            '0 2 * * 0',
            async () => {
                await this.runComputation('90d');
            },
            {
                timezone: 'UTC',
            }
        );

        this.jobs.set('7d', job7d);
        this.jobs.set('30d', job30d);
        this.jobs.set('90d', job90d);

        console.log('[InsightsCron] ✅ Cron jobs started:');
        console.log('  - 7d insights: Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)');
        console.log('  - 30d insights: Daily at 01:00 UTC');
        console.log('  - 90d insights: Weekly on Sunday at 02:00 UTC');
    }

    /**
     * Stop all cron jobs
     */
    static stop() {
        console.log('[InsightsCron] Stopping cron jobs...');
        this.jobs.forEach((job, name) => {
            job.stop();
            console.log(`[InsightsCron] Stopped ${name} job`);
        });
        this.jobs.clear();
        console.log('[InsightsCron] ✅ All cron jobs stopped');
    }

    /**
     * Run computation manually (for testing or on-demand)
     */
    static async runManual(timeRange: '7d' | '30d' | '90d' = '7d') {
        console.log(`[InsightsCron] Manual computation triggered for ${timeRange}`);
        await this.runComputation(timeRange);
    }

    /**
     * Run computation for a specific time range
     */
    private static async runComputation(timeRange: '7d' | '30d' | '90d') {
        if (this.isRunning) {
            console.log(`[InsightsCron] ⚠️ Computation already running, skipping ${timeRange}`);
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            console.log(`[InsightsCron] 🚀 Starting ${timeRange} insights computation...`);

            const results = await InsightsComputationService.computeForAllActiveOutlets(timeRange);

            const duration = Date.now() - startTime;
            const successful = results.filter((r) => r.success).length;
            const failed = results.filter((r) => !r.success).length;

            console.log(`[InsightsCron] ✅ Completed ${timeRange} computation in ${duration}ms`);
            console.log(`[InsightsCron] Results: ${successful} successful, ${failed} failed`);

            // Log failed outlets for debugging
            if (failed > 0) {
                const failedOutlets = results.filter((r) => !r.success);
                console.error('[InsightsCron] Failed outlets:', failedOutlets.map((r) => r.outletId));
            }
        } catch (error: any) {
            console.error(`[InsightsCron] ❌ Fatal error during ${timeRange} computation:`, error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Get status of cron jobs
     */
    static getStatus() {
        return {
            isRunning: this.isRunning,
            jobs: Array.from(this.jobs.keys()),
            jobCount: this.jobs.size,
        };
    }
}
