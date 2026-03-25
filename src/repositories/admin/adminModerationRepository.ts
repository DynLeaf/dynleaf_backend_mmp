import { Story } from '../../models/Story.js';

export const findModerationStories = async (query: Record<string, unknown>, skip: number, limit: number) => {
    const [stories, total] = await Promise.all([
        Story.find(query)
            .populate({
                path: 'outletId',
                select: 'name brand_id',
                populate: { path: 'brand_id', select: 'name logo_url' }
            })
            .populate('createdBy', 'username email')
            .sort({ created_at: 1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Story.countDocuments(query)
    ]);
    return { stories, total };
};

export const updateStoryModerationStatus = async (id: string, isRejected: boolean, reason?: string) => {
    const updatePayload: any = {
        'flags.isModerated': true,
        'flags.isRejected': isRejected,
    };

    if (isRejected) {
        updatePayload['flags.rejectionReason'] = reason;
        updatePayload.status = 'archived';
    }

    return await Story.findByIdAndUpdate(id, updatePayload, { new: true }).lean();
};
