import mongoose from 'mongoose';

export interface IOutletInsightsSummary {
    outlet_id: mongoose.Types.ObjectId;
    time_range: '7d' | '30d' | '90d' | 'today';
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
