import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Outlet } from '../models/Outlet.js';
import { OutletAnalyticsEvent } from '../models/OutletAnalyticsEvent.js';
import { OutletAnalyticsSummary } from '../models/OutletAnalyticsSummary.js';

// Load environment variables
dotenv.config();

/**
 * One-time migration script to aggregate all historical OutletAnalyticsEvent data
 * into OutletAnalyticsSummary collection
 */
async function migrateHistoricalData() {
    try {
        console.log('[MIGRATION] Starting historical outlet analytics migration...');

        // Connect to MongoDB
        const mongoUri = ''
        await mongoose.connect(mongoUri);
        console.log('[MIGRATION] Connected to MongoDB');

        // Get all unique dates from OutletAnalyticsEvent
        const uniqueDates = await OutletAnalyticsEvent.aggregate([
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$timestamp',
                        },
                    },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        console.log(`[MIGRATION] Found ${uniqueDates.length} unique dates to process`);

        const outlets = await Outlet.find({});
        console.log(`[MIGRATION] Found ${outlets.length} outlets`);

        let processedCount = 0;

        // Process each date
        for (const dateDoc of uniqueDates) {
            const dateStr = dateDoc._id;
            const date = new Date(dateStr);
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);

            console.log(`[MIGRATION] Processing date: ${dateStr}`);

            // Process each outlet for this date
            for (const outlet of outlets) {
                const groups = await OutletAnalyticsEvent.aggregate([
                    {
                        $match: {
                            outlet_id: outlet._id,
                            timestamp: { $gte: date, $lt: nextDay },
                        },
                    },
                    {
                        $group: {
                            _id: {
                                event_type: '$event_type',
                                device_type: '$device_type',
                                hour: { $hour: '$timestamp' },
                                is_qr: {
                                    $cond: [
                                        { $in: ['$source', ['qr', 'QR', 'qrcode', 'qr_code', 'qr_scan']] },
                                        true,
                                        false,
                                    ],
                                },
                            },
                            count: { $sum: 1 },
                            unique_sessions: { $addToSet: '$session_id' },
                        },
                    },
                ]);

                if (groups.length === 0) continue;

                const outlet_visits = groups
                    .filter((g: any) => g._id.event_type === 'outlet_visit')
                    .reduce((sum: number, g: any) => sum + g.count, 0);

                const profile_views = groups
                    .filter((g: any) => g._id.event_type === 'profile_view')
                    .reduce((sum: number, g: any) => sum + g.count, 0);

                const menu_views = groups
                    .filter((g: any) => g._id.event_type === 'menu_view')
                    .reduce((sum: number, g: any) => sum + g.count, 0);

                // QR-specific metrics
                const qr_profile_views = groups
                    .filter((g: any) => g._id.event_type === 'profile_view' && g._id.is_qr === true)
                    .reduce((sum: number, g: any) => sum + g.count, 0);

                const qr_menu_views = groups
                    .filter((g: any) => g._id.event_type === 'menu_view' && g._id.is_qr === true)
                    .reduce((sum: number, g: any) => sum + g.count, 0);

                const allUniqueSessions = new Set(groups.flatMap((g: any) => g.unique_sessions));

                const view_to_menu_rate = profile_views > 0 ? (menu_views / profile_views) * 100 : 0;

                const device_breakdown = {
                    mobile: groups.filter((g: any) => g._id.device_type === 'mobile').reduce((s: number, g: any) => s + g.count, 0),
                    desktop: groups.filter((g: any) => g._id.device_type === 'desktop').reduce((s: number, g: any) => s + g.count, 0),
                    tablet: groups.filter((g: any) => g._id.device_type === 'tablet').reduce((s: number, g: any) => s + g.count, 0),
                };

                const hourly_breakdown = Array.from({ length: 24 }, (_, hour) => {
                    const hourEvents = groups.filter((g: any) => g._id.hour === hour);
                    return {
                        hour,
                        profile_views: hourEvents
                            .filter((g: any) => g._id.event_type === 'profile_view')
                            .reduce((sum: number, g: any) => sum + g.count, 0),
                        menu_views: hourEvents
                            .filter((g: any) => g._id.event_type === 'menu_view')
                            .reduce((sum: number, g: any) => sum + g.count, 0),
                    };
                });

                // Upsert the summary
                await OutletAnalyticsSummary.findOneAndUpdate(
                    { outlet_id: outlet._id, date: date },
                    {
                        $set: {
                            metrics: {
                                outlet_visits,
                                profile_views,
                                menu_views,
                                qr_menu_views,
                                qr_profile_views,
                                unique_sessions: allUniqueSessions.size,
                                view_to_menu_rate: parseFloat(view_to_menu_rate.toFixed(2)),
                            },
                            device_breakdown,
                            hourly_breakdown,
                        },
                    },
                    { upsert: true, new: true }
                );

                processedCount++;
            }

            console.log(`[MIGRATION] ✓ Completed date: ${dateStr}`);
        }

        console.log(`[MIGRATION] ========================================`);
        console.log(`[MIGRATION] Migration completed successfully!`);
        console.log(`[MIGRATION] Processed ${uniqueDates.length} dates`);
        console.log(`[MIGRATION] Created/Updated ${processedCount} summary records`);
        console.log(`[MIGRATION] ========================================`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('[MIGRATION] Error during migration:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run the migration
migrateHistoricalData();
