import mongoose from 'mongoose';
import { MetricComputers } from './MetricComputers.js';

export class TrendComputer {
    static async computeTrends(
        outletId: mongoose.Types.ObjectId,
        currentPeriod: { start: Date; end: Date },
        previousPeriod: { start: Date; end: Date }
    ) {
        const [currentMetrics, previousMetrics] = await Promise.all([
            MetricComputers.computeBasicMetrics(outletId, currentPeriod),
            MetricComputers.computeBasicMetrics(outletId, previousPeriod),
        ]);

        const calculateChange = (current: number, previous: number) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return parseFloat((((current - previous) / previous) * 100).toFixed(2));
        };

        return {
            visits_change_pct: calculateChange(currentMetrics.total_visits, previousMetrics.total_visits),
            menu_views_change_pct: calculateChange(currentMetrics.total_menu_views, previousMetrics.total_menu_views),
            profile_views_change_pct: calculateChange(currentMetrics.total_profile_views, previousMetrics.total_profile_views),
            unique_visitors_change_pct: calculateChange(currentMetrics.unique_visitors, previousMetrics.unique_visitors),
        };
    }
}
