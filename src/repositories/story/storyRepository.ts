import { Story, IStory } from '../../models/Story.js';
import { Outlet } from '../../models/Outlet.js';
import mongoose from 'mongoose';

export class StoryRepository {
    async findById(id: string): Promise<IStory | null> {
        return await Story.findById(id).exec();
    }

    async findActiveByOutlet(outletId: string, now: Date = new Date()): Promise<IStory[]> {
        const oid = mongoose.Types.ObjectId.isValid(outletId)
            ? new mongoose.Types.ObjectId(outletId)
            : null;
        if (!oid) return [];
        return await Story.find({
            outletId: oid,
            status: 'live',
            visibilityStart: { $lte: now },
            visibilityEnd: { $gt: now }
        })
        .sort({ created_at: 1 })
        .lean();
    }

    async countTodayStories(outletId: string): Promise<number> {
        const oid = mongoose.Types.ObjectId.isValid(outletId)
            ? new mongoose.Types.ObjectId(outletId)
            : null;
        if (!oid) return 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return await Story.countDocuments({
            outletId: oid,
            created_at: { $gte: today }
        });
    }

    async create(data: Partial<IStory>): Promise<IStory> {
        return await Story.create(data);
    }

    async update(id: string, data: Partial<IStory>): Promise<IStory | null> {
        return await Story.findByIdAndUpdate(id, data, { new: true }).exec();
    }

    async delete(id: string): Promise<boolean> {
        const result = await Story.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    async getStoryFeed(longitude?: number, latitude?: number, radius: number = 10000, limit: number = 50, now: Date = new Date()): Promise<any[]> {
        const pipeline: any[] = [
            {
                $match: {
                    status: 'ACTIVE',
                    approval_status: 'APPROVED'
                }
            }
        ];

        if (latitude !== undefined && longitude !== undefined) {
            pipeline.unshift({
                $geoNear: {
                    near: {
                        type: 'Point',
                        coordinates: [longitude, latitude]
                    },
                    distanceField: 'distance',
                    maxDistance: radius,
                    query: { status: 'ACTIVE', approval_status: 'APPROVED' },
                    spherical: true
                }
            });
        } else {
            pipeline.push({ $limit: limit });
        }

        pipeline.push({
            $project: {
                _id: 1,
                name: 1,
                slug: 1,
                'media.cover_image_url': 1,
                location: 1,
                address: 1,
                status: 1,
                approval_status: 1,
                brand_id: 1
            }
        });

        pipeline.push(
            {
                $lookup: {
                    from: 'stories',
                    let: { outletId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$outletId', '$$outletId'] },
                                        { $eq: ['$status', 'live'] },
                                        { $lte: ['$visibilityStart', now] },
                                        { $gt: ['$visibilityEnd', now] }
                                    ]
                                }
                            }
                        },
                        { $sort: { created_at: 1 } }
                    ],
                    as: 'stories'
                }
            },
            { $match: { stories: { $ne: [] } } }
        );

        pipeline.push(
            {
                $lookup: {
                    from: 'brands',
                    localField: 'brand_id',
                    foreignField: '_id',
                    as: 'brand'
                }
            },
            { $unwind: { path: '$brand', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    slug: 1,
                    media: 1,
                    location: 1,
                    address: 1,
                    status: 1,
                    approval_status: 1,
                    stories: 1,
                    brand: {
                        _id: '$brand._id',
                        name: '$brand.name',
                        verification_status: '$brand.verification_status'
                    }
                }
            }
        );

        return await Outlet.aggregate(pipeline);
    }

    async aggregate(pipeline: any[]): Promise<any[]> {
        return await Story.aggregate(pipeline);
    }
}

export const storyRepository = new StoryRepository();
