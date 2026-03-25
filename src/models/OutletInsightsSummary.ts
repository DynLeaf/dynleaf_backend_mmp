import mongoose, { Schema, Document } from 'mongoose';
import { IOutletInsightsSummary } from '../types/analytics.js';

export interface IOutletInsightsSummaryDocument extends IOutletInsightsSummary, Document {}

const OutletInsightsSummarySchema = new Schema<IOutletInsightsSummaryDocument>(
    {
        outlet_id: {
            type: Schema.Types.ObjectId,
            ref: 'Outlet',
            required: true,
            index: true,
        },
        time_range: {
            type: String,
            enum: ['7d', '30d', '90d', 'today'],
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

export const OutletInsightsSummary = mongoose.model<IOutletInsightsSummaryDocument>(
    'OutletInsightsSummary',
    OutletInsightsSummarySchema
);
