import { storyRepository } from '../../repositories/story/storyRepository.js';
import { storyMetricsRepository } from '../../repositories/story/storyMetricsRepository.js';
import { CreateStoryRequestDto } from '../../dto/story/createStory.request.dto.js';
import { StoryResponseDto } from '../../dto/story/story.response.dto.js';
import { getS3Service } from '../s3Service.js';
import { storyMetricsService } from './storyMetricsService.js';
import * as outletService from '../outletService.js';
import * as subscriptionRepo from '../../repositories/subscriptionRepository.js';
import { SUBSCRIPTION_FEATURES, hasFeature } from '../../config/subscriptionPlans.js';
import { AppError } from '../../errors/AppError.js';
import mongoose from 'mongoose';

export class StoryService {
    private readonly MAX_STORIES_PER_DAY = 10;

    async createStory(userId: string, dto: CreateStoryRequestDto): Promise<StoryResponseDto> {
        const outlet = await outletService.getOutletById(dto.outletId);
        if (!outlet) {
            throw new AppError('Outlet not found', 404);
        }

        const storiesToday = await storyRepository.countTodayStories(String(outlet._id));
        if (storiesToday >= this.MAX_STORIES_PER_DAY) {
            throw new AppError(`Daily story limit reached (${this.MAX_STORIES_PER_DAY})`, 400);
        }

        if (dto.pinned) {
            await this.validateStoryPinning(outlet);
        }

        const processedSlides = await Promise.all(dto.slides.map(async (slide: any, index: number) => {
            let mediaUrl = slide.mediaUrl;
            if (mediaUrl && mediaUrl.startsWith('data:')) {
                const s3Service = getS3Service();
                const matches = mediaUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (!matches || matches.length !== 3) {
                    throw new AppError('Invalid base64 string', 400);
                }
                const mimeType = matches[1];
                const base64Content = matches[2];
                const buffer = Buffer.from(base64Content, 'base64');
                const uploadedFile = await s3Service.uploadBuffer(
                    buffer,
                    'story',
                    String(outlet._id),
                    `story-${Date.now()}`,
                    mimeType
                );
                mediaUrl = uploadedFile.key;
            }

            return {
                ...slide,
                mediaUrl,
                orderIndex: index,
                duration: slide.duration || 5
            };
        }));

        const start = dto.visibilityStart ? new Date(dto.visibilityStart) : new Date();
        const end = dto.visibilityEnd ? new Date(dto.visibilityEnd) : new Date(start.getTime() + 24 * 60 * 60 * 1000);

        const story = await storyRepository.create({
            outletId: outlet._id,
            slides: processedSlides as any,
            category: dto.category,
            status: 'live',
            pinned: dto.pinned || false,
            visibilityStart: start,
            visibilityEnd: end,
            createdBy: new mongoose.Types.ObjectId(userId)
        });

        await storyMetricsRepository.create({
            storyId: story._id,
            outletId: outlet._id
        });

        return this.mapToDto(story);
    }

    async getOutletStories(outletIdOrSlug: string): Promise<StoryResponseDto[]> {
        // Resolve slug to actual ObjectId in case a slug is passed
        const outlet = await outletService.getOutletById(outletIdOrSlug);
        if (!outlet) return [];
        const stories = await storyRepository.findActiveByOutlet(String(outlet._id));
        return stories.map(s => this.mapToDto(s));
    }

    async deleteStory(id: string): Promise<void> {
        const story = await storyRepository.findById(id);
        if (!story) {
            throw new AppError('Story not found', 404);
        }

        const mediaKeys = story.slides
            .map(slide => slide.mediaUrl)
            .filter(url => url && !url.startsWith('http'));

        await storyRepository.delete(id);
        await storyMetricsRepository.deleteByStoryId(id);

        if (mediaKeys.length > 0) {
            const s3 = getS3Service();
            await s3.deleteMultipleFiles(mediaKeys);
        }
    }

    private async validateStoryPinning(outlet: any): Promise<void> {
        if (!outlet?.subscription_id) {
            throw new AppError('Story pinning requires an active subscription', 403);
        }

        const subscription = await subscriptionRepo.findSubscriptionById(outlet.subscription_id);
        if (!subscription) {
            throw new AppError('Subscription not found', 403);
        }

        if (subscription.status !== 'active' && subscription.status !== 'trial') {
            throw new AppError(`Subscription is ${subscription.status}. Story pinning requires an active subscription.`, 403);
        }

        if (!hasFeature(subscription.plan, SUBSCRIPTION_FEATURES.STORY_PINNING)) {
            throw new AppError('Story pinning is a premium feature. Upgrade your subscription to pin stories.', 403);
        }
    }

    async getStoryFeed(longitude?: number, latitude?: number, radius?: number, userId?: string): Promise<any[]> {
        const stories = await storyRepository.getStoryFeed(longitude, latitude, radius);
        
        let viewedStoryIds = new Set<string>();
        if (userId) {
            const viewedStories = await storyMetricsService.getSeenStatus(userId);
            viewedStoryIds = new Set(viewedStories.map((v: any) => v.storyId.toString()));
        }

        return stories.map((outlet: any) => {
            const mappedStories = outlet.stories.map((story: any) => {
                const mapped = this.mapToDto(story);
                return {
                    ...mapped,
                    isSeen: viewedStoryIds.has(mapped.id)
                };
            });

            return {
                outlet: outlet,
                stories: mappedStories,
                latestUpdate: mappedStories[0]?.created_at || new Date(),
                hasUnseen: mappedStories.some((s: any) => !s.isSeen)
            };
        });
    }

    async getAdminOutletStories(outletIdOrSlug: string): Promise<StoryResponseDto[]> {
        const outlet = await outletService.getOutletById(outletIdOrSlug);
        if (!outlet) return [];
        const oid = new mongoose.Types.ObjectId(String(outlet._id));
        const stories = await storyRepository.aggregate([
            { $match: { outletId: oid } },
            { $sort: { created_at: -1 } }
        ]);
        return stories.map(s => this.mapToDto(s));
    }

    async updateStoryStatus(id: string, status?: string, pinned?: boolean): Promise<StoryResponseDto> {
        const story = await storyRepository.findById(id);
        if (!story) throw new AppError('Story not found', 404);

        if (status) {
            story.status = status as any;
            if (status === 'archived') {
                const mediaKeys = story.slides
                    .map(slide => slide.mediaUrl)
                    .filter(url => url && !url.startsWith('http'));

                if (mediaKeys.length > 0) {
                    const s3 = getS3Service();
                    await s3.deleteMultipleFiles(mediaKeys);
                }
            }
        }

        if (typeof pinned === 'boolean') {
            if (pinned) {
                const outlet = await outletService.getOutletById(String(story.outletId));
                await this.validateStoryPinning(outlet);
            }
            story.pinned = pinned;
        }

        const updated = await storyRepository.update(id, story);
        return this.mapToDto(updated);
    }

    private mapToDto(story: any): StoryResponseDto {
        return {
            id: story._id.toString(),
            outletId: story.outletId.toString(),
            category: story.category,
            status: story.status,
            pinned: story.pinned,
            slides: story.slides.map((s: any) => ({
                mediaUrl: s.mediaUrl,
                mediaType: s.mediaType,
                caption: s.caption,
                ctaLink: s.ctaLink,
                ctaText: s.ctaText,
                orderIndex: s.orderIndex,
                duration: s.duration
            })),
            visibilityStart: story.visibilityStart,
            visibilityEnd: story.visibilityEnd,
            created_at: story.created_at
        };
    }
}

export const storyService = new StoryService();
