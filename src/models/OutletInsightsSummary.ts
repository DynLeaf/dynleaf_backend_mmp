import mongoose, { Schema, Document } from 'mongoose';

/**
 * Pre-computed insights summary for outlets
 * Updated by cron job every 6 hours to avoid heavy real-time computation
 */

export interface IOutletInsightsSummary extends Document {
    outlet_id: mongoose.Types.ObjectId;
    time_range: '7d' | '30d' | '90d';
    computed_at: Date;
    period_start: Date;
    period_end: Date;

    // Basic metrics (shown to free tier)
    total_visits: number;
    total_menu_views: number;
    total_profile_views: number;
    unique_visitors: number;

    // Top performing item (shown to free tier - only #1)
    top_food_item: {
        id: string;
        name: string;
        views: number;
        image_url?: string;
    } | null;

    // Device breakdown (shown to free tier)
    device_breakdown: {
        mobile: number;
        desktop: number;
        tablet: number;
        mobile_pct: number;
        desktop_pct: number;
        tablet_pct: number;
    };

    // Premium metrics (locked for free tier)
    premium_data: {
        // Conversion funnel
        funnel: {
            visits: number;
            profile_sessions: number;
            menu_sessions: number;
            visit_to_profile_rate: number;
            visit_to_menu_rate: number;
            profile_to_menu_rate: number;
        };

        // Audience insights
        audience: {
            new_sessions: number;
            returning_sessions: number;
            new_pct: number;
            returning_pct: number;
        };

        // Traffic sources
        sources: Array<{
            source: string;
            count: number;
            percentage: number;
        }>;

        // Entry pages
        entry_pages: Array<{
            page: string;
            count: number;
            percentage: number;
        }>;

        // Top 10 food items (full list)
        top_food_items: Array<{
            id: string;
            name: string;
            views: number;
            impressions: number;
            add_to_cart: number;
            orders: number;
            conversion_rate: number;
            image_url?: string;
        }>;

        // Offer performance
        offers: {
            total_offers: number;
            total_views: number;
            total_clicks: number;
            total_code_copies: number;
            avg_ctr: number;
            top_offer: {
                id: string;
                title: string;
                views: number;
                clicks: number;
                code_copies: number;
                ctr: number;
            } | null;
        };

        // Promotion performance
        promotions: {
            total_promotions: number;
            total_impressions: number;
            total_clicks: number;
            avg_ctr: number;
            top_promotion: {
                id: string;
                title: string;
                impressions: number;
                clicks: number;
                ctr: number;
            } | null;
        };

        // Time series data (daily breakdown)
        daily_series: Array<{
            date: string; // YYYY-MM-DD
            visits: number;
            profile_views: number;
            menu_views: number;
            unique_sessions: number;
        }>;

        // Peak hours (hourly breakdown)
        peak_hours: Array<{
            hour: number; // 0-23
            visits: number;
        }>;

        // Geographic breakdown
        geographic: Array<{
            city: string;
            country: string;
            count: number;
            percentage: number;
        }>;
    };

    // Trends (comparison with previous period)
    trends: {
        visits_change_pct: number;
        menu_views_change_pct: number;
        profile_views_change_pct: number;
        unique_visitors_change_pct: number;
    };

    // Metadata
    computation_duration_ms: number;
    events_processed: number;
    status: 'success' | 'partial' | 'failed';
    error_message?: string;
}

const OutletInsightsSummarySchema = new Schema<IOutletInsightsSummary>(
    {
        outlet_id: {
            type: Schema.Types.ObjectId,
            ref: 'Outlet',
            required: true,
            index: true,
        },
        time_range: {
            type: String,
            enum: ['7d', '30d', '90d'],
            required: true,
        },
        computed_at: {
            type: Date,
            required: true,
            default: Date.now,
            index: true,
        },
        period_start: {
            type: Date,
            required: true,
        },
        period_end: {
            type: Date,
            required: true,
        },

        // Basic metrics
        total_visits: { type: Number, default: 0 },
        total_menu_views: { type: Number, default: 0 },
        total_profile_views: { type: Number, default: 0 },
        unique_visitors: { type: Number, default: 0 },

        top_food_item: {
            type: {
                id: String,
                name: String,
                views: Number,
                image_url: String,
            },
            default: null,
        },

        device_breakdown: {
            type: {
                mobile: Number,
                desktop: Number,
                tablet: Number,
                mobile_pct: Number,
                desktop_pct: Number,
                tablet_pct: Number,
            },
            required: true,
        },

        premium_data: {
            type: {
                funnel: {
                    visits: Number,
                    profile_sessions: Number,
                    menu_sessions: Number,
                    visit_to_profile_rate: Number,
                    visit_to_menu_rate: Number,
                    profile_to_menu_rate: Number,
                },
                audience: {
                    new_sessions: Number,
                    returning_sessions: Number,
                    new_pct: Number,
                    returning_pct: Number,
                },
                sources: [
                    {
                        source: String,
                        count: Number,
                        percentage: Number,
                    },
                ],
                entry_pages: [
                    {
                        page: String,
                        count: Number,
                        percentage: Number,
                    },
                ],
                top_food_items: [
                    {
                        id: String,
                        name: String,
                        views: Number,
                        impressions: Number,
                        add_to_cart: Number,
                        orders: Number,
                        conversion_rate: Number,
                        image_url: String,
                    },
                ],
                offers: {
                    total_offers: Number,
                    total_views: Number,
                    total_clicks: Number,
                    total_code_copies: Number,
                    avg_ctr: Number,
                    top_offer: {
                        id: String,
                        title: String,
                        views: Number,
                        clicks: Number,
                        code_copies: Number,
                        ctr: Number,
                    },
                },
                promotions: {
                    total_promotions: Number,
                    total_impressions: Number,
                    total_clicks: Number,
                    avg_ctr: Number,
                    top_promotion: {
                        id: String,
                        title: String,
                        impressions: Number,
                        clicks: Number,
                        ctr: Number,
                    },
                },
                daily_series: [
                    {
                        date: String,
                        visits: Number,
                        profile_views: Number,
                        menu_views: Number,
                        unique_sessions: Number,
                    },
                ],
                peak_hours: [
                    {
                        hour: Number,
                        visits: Number,
                    },
                ],
                geographic: [
                    {
                        city: String,
                        country: String,
                        count: Number,
                        percentage: Number,
                    },
                ],
            },
            required: true,
        },

        trends: {
            type: {
                visits_change_pct: Number,
                menu_views_change_pct: Number,
                profile_views_change_pct: Number,
                unique_visitors_change_pct: Number,
            },
            required: true,
        },

        computation_duration_ms: { type: Number, required: true },
        events_processed: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ['success', 'partial', 'failed'],
            default: 'success',
        },
        error_message: String,
    },
    {
        timestamps: true,
    }
);

// Compound index for efficient querying
OutletInsightsSummarySchema.index({ outlet_id: 1, time_range: 1, computed_at: -1 });

// TTL index to auto-delete old summaries (keep last 30 days of computations)
OutletInsightsSummarySchema.index({ computed_at: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const OutletInsightsSummary = mongoose.model<IOutletInsightsSummary>(
    'OutletInsightsSummary',
    OutletInsightsSummarySchema
);
