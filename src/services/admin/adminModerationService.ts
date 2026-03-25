import { AppError } from '../../errors/AppError.js';
import * as moderationRepo from '../../repositories/admin/adminModerationRepository.js';

export const listModerationStories = async (page: number, limit: number) => {
    const skip = (page - 1) * limit;
    const query = {
        'flags.isModerated': false,
        status: { $in: ['live', 'active'] }
    };

    const { stories, total } = await moderationRepo.findModerationStories(query, skip, limit);
    return { stories, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const approveStory = async (id: string) => {
    const story = await moderationRepo.updateStoryModerationStatus(id, false);
    if (!story) throw new AppError('Story not found', 404);
    return story;
};

export const rejectStory = async (id: string, reason: string) => {
    if (!reason?.trim()) throw new AppError('Rejection reason is required', 400);
    const story = await moderationRepo.updateStoryModerationStatus(id, true, reason);
    if (!story) throw new AppError('Story not found', 404);
    return story;
};
