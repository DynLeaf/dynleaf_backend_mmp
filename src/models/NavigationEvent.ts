import mongoose, { Schema, Document } from 'mongoose';

export interface INavigationEvent extends Document {
    session_id: string;
    user_id?: mongoose.Types.ObjectId;

    // Navigation details
    from: string;  // Previous page path
    to: string;    // Destination page path
    method: 'click' | 'back' | 'forward' | 'direct';

    // Device info
    device_type: 'mobile' | 'desktop' | 'tablet';
    user_agent?: string;

    // Network
    ip_address?: string;

    // Timestamp
    timestamp: Date;
}

const navigationEventSchema = new Schema<INavigationEvent>(
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

        from: {
            type: String,
            required: true,
            index: true,
        },
        to: {
            type: String,
            required: true,
            index: true,
        },
        method: {
            type: String,
            enum: ['click', 'back', 'forward', 'direct'],
            required: true,
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

// Indexes for efficient flow analysis queries
navigationEventSchema.index({ session_id: 1, timestamp: 1 });
navigationEventSchema.index({ from: 1, to: 1 });
navigationEventSchema.index({ from: 1, timestamp: -1 });
navigationEventSchema.index({ user_id: 1, timestamp: -1 });
navigationEventSchema.index({ timestamp: -1 });

export const NavigationEvent = mongoose.model<INavigationEvent>(
    'NavigationEvent',
    navigationEventSchema
);
