import { StoryMetrics, IStoryMetrics } from '../../models/StoryMetrics.js';
import mongoose from 'mongoose';

export class StoryMetricsRepository {
    async findByStoryId(storyId: string): Promise<IStoryMetrics | null> {
        return await StoryMetrics.findOne({ storyId: new mongoose.Types.ObjectId(storyId) }).exec();
    }

    async findByOutletId(outletId: string): Promise<IStoryMetrics[]> {
        return await StoryMetrics.find({ outletId: new mongoose.Types.ObjectId(outletId) })
            .populate('storyId', 'slides category created_at status')
            .lean();
    }

    async create(data: Partial<IStoryMetrics>): Promise<IStoryMetrics> {
        return await StoryMetrics.create(data);
    }

    async incrementViews(storyId: string, isUnique: boolean): Promise<void> {
        const update: any = { $inc: { totalViews: 1 } };
        if (isUnique) {
            update.$inc.uniqueViews = 1;
        }
        await StoryMetrics.findOneAndUpdate(
            { storyId: new mongoose.Types.ObjectId(storyId) },
            update,
            { upsert: true }
        );
    }

    async deleteByStoryId(storyId: string): Promise<void> {
        await StoryMetrics.deleteOne({ storyId: new mongoose.Types.ObjectId(storyId) });
    }
}

export const storyMetricsRepository = new StoryMetricsRepository();
