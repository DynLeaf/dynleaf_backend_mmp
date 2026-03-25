import { storyMetricsRepository } from '../../repositories/story/storyMetricsRepository.js';
import { storyViewRepository } from '../../repositories/story/storyViewRepository.js';
import { storyRepository } from '../../repositories/story/storyRepository.js';
import { AppError } from '../../errors/AppError.js';

export class StoryMetricsService {
    async recordView(userId: string, storyId: string, completedAllSlides: boolean): Promise<{ isFirstView: boolean }> {
        const story = await storyRepository.findById(storyId);
        if (!story) {
            throw new AppError('Story not found', 404);
        }

        const existingView = await storyViewRepository.findView(userId, storyId);
        const isUniqueView = !existingView;

        await storyViewRepository.upsertView({
            userId: userId as any,
            storyId: storyId as any,
            outletId: story.outletId,
            completedAllSlides
        });

        await storyMetricsRepository.incrementViews(storyId, isUniqueView);

        return { isFirstView: isUniqueView };
    }

    async getSeenStatus(userId: string) {
        return await storyViewRepository.findUserViews(userId);
    }

    async getStoryAnalytics(outletId: string) {
        return await storyMetricsRepository.findByOutletId(outletId);
    }
}

export const storyMetricsService = new StoryMetricsService();
