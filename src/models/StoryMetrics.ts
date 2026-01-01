import mongoose, { Document, Schema } from 'mongoose';

export interface IStoryMetrics extends Document {
    storyId: mongoose.Types.ObjectId;
    outletId: mongoose.Types.ObjectId; // Denormalized for outlet-level aggregation
    totalViews: number;
    uniqueViews: number;
    menuClicks: number;
    profileClicks: number;
    shares: number;
    completionRate: number; // Percentage 0-100
    lastUpdated: Date;
    
    // Daily breakdown for charts
    dailyStats: Array<{
        date: Date;
        views: number;
        uniqueViews: number;
    }>;
}

const storyMetricsSchema = new Schema<IStoryMetrics>({
    storyId: { type: Schema.Types.ObjectId, ref: 'Story', required: true, unique: true },
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    totalViews: { type: Number, default: 0 },
    uniqueViews: { type: Number, default: 0 },
    menuClicks: { type: Number, default: 0 },
    profileClicks: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now },
    
    dailyStats: [{
        date: Date,
        views: Number,
        uniqueViews: Number
    }]
}, { timestamps: true });

storyMetricsSchema.index({ outletId: 1 });
storyMetricsSchema.index({ storyId: 1 });

export const StoryMetrics = mongoose.model<IStoryMetrics>('StoryMetrics', storyMetricsSchema);
