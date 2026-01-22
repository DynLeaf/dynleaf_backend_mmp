import mongoose, { Schema, Document } from 'mongoose';

export interface ISessionAnalytics extends Document {
    session_id: string;
    user_id?: mongoose.Types.ObjectId;

    // Session timing
    session_duration: number; // milliseconds
    page_time_spent: number; // milliseconds (active time)

    // Engagement metrics
    interaction_count: number; // clicks, scrolls, keypresses

    // Device info
    device_type: 'mobile' | 'desktop' | 'tablet';
    user_agent?: string;

    // Network
    ip_address?: string;

    // Timestamp
    timestamp: Date; // When session ended
}

const sessionAnalyticsSchema = new Schema<ISessionAnalytics>(
    {
        session_id: {
            type: String,
            required: true,
            index: true,
        },
        user_id: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            index: true,
        },

        session_duration: {
            type: Number,
            required: true,
        },
        page_time_spent: {
            type: Number,
            required: true,
        },

        interaction_count: {
            type: Number,
            default: 0,
        },

        device_type: {
            type: String,
            enum: ['mobile', 'desktop', 'tablet'],
            required: true,
        },
        user_agent: {
            type: String,
        },

        ip_address: {
            type: String,
        },

        timestamp: {
            type: Date,
            default: Date.now,
            index: true,
        },
    },
    {
        timestamps: false,
    }
);

// Indexes for efficient querying
sessionAnalyticsSchema.index({ timestamp: -1 });
sessionAnalyticsSchema.index({ user_id: 1, timestamp: -1 });
sessionAnalyticsSchema.index({ session_id: 1, timestamp: -1 });

export const SessionAnalytics = mongoose.model<ISessionAnalytics>(
    'SessionAnalytics',
    sessionAnalyticsSchema
);
