import { StoryView, IStoryView } from '../../models/StoryView.js';
import mongoose from 'mongoose';

export class StoryViewRepository {
    async findView(userId: string, storyId: string): Promise<IStoryView | null> {
        return await StoryView.findOne({ 
            userId: new mongoose.Types.ObjectId(userId), 
            storyId: new mongoose.Types.ObjectId(storyId) 
        }).lean();
    }

    async findUserViews(userId: string): Promise<IStoryView[]> {
        return await StoryView.find({ 
            userId: new mongoose.Types.ObjectId(userId) 
        }).select('storyId outletId viewedAt').lean();
    }

    async upsertView(data: Partial<IStoryView>): Promise<void> {
        await StoryView.findOneAndUpdate(
            { userId: data.userId, storyId: data.storyId },
            {
                outletId: data.outletId,
                viewedAt: new Date(),
                completedAllSlides: data.completedAllSlides || false
            },
            { upsert: true }
        );
    }
}

export const storyViewRepository = new StoryViewRepository();
