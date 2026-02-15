import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Story, IStory } from '../models/Story.js';
import { StoryMetrics } from '../models/StoryMetrics.js';
import { StoryView } from '../models/StoryView.js';
import { Outlet } from '../models/Outlet.js';
import { Subscription } from '../models/Subscription.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { getS3Service } from '../services/s3Service.js';
import { AuthRequest } from '../middleware/authMiddleware.js';
import { bulkDeleteFromCloudinary } from '../services/cloudinaryService.js';
import { SUBSCRIPTION_FEATURES, hasFeature } from '../config/subscriptionPlans.js';
import * as outletService from '../services/outletService.js';

const normalizePoint = (value: any): { x: number; y: number } | undefined => {
    if (!value || typeof value !== 'object') return undefined;
    const x = typeof value.x === 'number' ? value.x : undefined;
    const y = typeof value.y === 'number' ? value.y : undefined;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    return { x, y };
};

const validateStoryPinning = async (outlet: any): Promise<void> => {
    if (!outlet?.subscription_id) {
        throw new Error('Story pinning requires an active subscription');
    }

    const subscription = await Subscription.findById(outlet.subscription_id);
    if (!subscription) {
        throw new Error('Subscription not found');
    }

    if (subscription.status !== 'active' && subscription.status !== 'trial') {
        throw new Error(`Subscription is ${subscription.status}. Story pinning requires an active subscription.`);
    }

    if (!hasFeature(subscription.plan, SUBSCRIPTION_FEATURES.STORY_PINNING)) {
        throw new Error('Story pinning is a premium feature. Upgrade your subscription to pin stories.');
    }
};

const unpinOtherStories = async (outletId: string, excludeStoryId?: mongoose.Types.ObjectId): Promise<void> => {
    await Story.updateMany(
        { outletId, _id: { $ne: excludeStoryId || null } },
        { $set: { pinned: false } }
    );
};

// Constants
const MAX_STORIES_PER_DAY = 10;
const DEFAULT_STORY_DURATION = 5;
const STORY_DEFAULT_VISIBILITY_HOURS = 24;
const DEFAULT_RADIUS = 10000;
const DEFAULT_OUTLET_LIMIT = 50;
const STATUS_CODE_BAD_REQUEST = 400;
const STATUS_CODE_FORBIDDEN = 403;
const STATUS_CODE_NOT_FOUND = 404;

// Helper Functions
const checkOutletAccess = async (user: any, outletId: string): Promise<boolean> => {
    if (user.activeRole?.role === 'admin') return true;

    // Check if user has access to this outlet in their roles
    const hasAccess = user.roles.some((r: any) => {
        if (r.role === 'admin') return true;
        if (r.scope === 'outlet' && r.outletId?.toString() === outletId) return true;
        // If scope is brand, we'd need to check if outlet belongs to brand, but for now strict outlet check
        // Ideally we fetch outlet and check brand ownership too if scope is brand
        return false;
    });

    // Also check if they are the owner of the outlet (created_by) or in managers list
    if (!hasAccess) {
        const outlet = await Outlet.findById(outletId);
        if (outlet && (outlet.created_by_user_id.toString() === user.id ||
            outlet.managers?.some(m => m.user_id.toString() === user.id))) {
            return true;
        }
        return false;
    }

    return hasAccess;
};

// --- Controllers ---

export const createStory = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId: idOrSlug, slides, category, visibilityStart, visibilityEnd, pinned } = req.body;

        if (!idOrSlug || !slides || slides.length === 0 || !category) {
            return sendError(res, 'Missing required fields (outletId, slides, category)', STATUS_CODE_BAD_REQUEST);
        }

        const outlet = await outletService.getOutletById(idOrSlug);
        if (!outlet) {
            return sendError(res, 'Outlet not found', STATUS_CODE_NOT_FOUND);
        }
        const actualOutletId = outlet._id.toString();

        if (!req.user || !await checkOutletAccess(req.user, actualOutletId)) {
            return sendError(res, 'Unauthorized to create story for this outlet', STATUS_CODE_FORBIDDEN);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const storiesToday = await Story.countDocuments({
            outletId: actualOutletId,
            created_at: { $gte: today }
        });

        if (storiesToday >= MAX_STORIES_PER_DAY) {
            return sendError(res, `Daily story limit reached (${MAX_STORIES_PER_DAY})`, STATUS_CODE_BAD_REQUEST);
        }
        const processedSlides = await Promise.all(slides.map(async (slide: any, index: number) => {
            let mediaUrl = slide.mediaUrl;
            if (mediaUrl && mediaUrl.startsWith('data:')) {
                const s3Service = getS3Service();
                const matches = mediaUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (!matches || matches.length !== 3) {
                    throw new Error('Invalid base64 string');
                }
                const mimeType = matches[1];
                const base64Content = matches[2];
                const buffer = Buffer.from(base64Content, 'base64');
                const uploadedFile = await s3Service.uploadBuffer(
                    buffer,
                    'story',
                    slide.outletId || 'unknown',
                    `story-${Date.now()}`,
                    mimeType
                );
                mediaUrl = uploadedFile.key;
            }

            const imagePosition = normalizePoint(slide.imagePosition);
            const imagePositionPct = normalizePoint(slide.imagePositionPct);
            const captionPosition = normalizePoint(slide.captionPosition);
            const captionPositionPct = normalizePoint(slide.captionPositionPct);

            return {
                mediaUrl,
                mediaType: slide.mediaType || 'image',
                caption: slide.caption,
                ctaLink: slide.ctaLink,
                ctaText: slide.ctaText,
                orderIndex: index,
                duration: slide.duration || 5,

                // Text formatting
                textColor: slide.textColor,
                textSize: slide.textSize,
                textStyle: slide.textStyle,
                captionBgColor: slide.captionBgColor,
                captionOpacity: slide.captionOpacity,

                // Image adjustment
                imageScale: slide.imageScale,
                imagePosition,
                imagePositionPct,

                // Caption positioning
                captionPosition,
                captionPositionPct
            };
        }));

        // 3.5. Check subscription for pinning feature
        if (pinned) {
            if (!outlet?.subscription_id) {
                return sendError(res, 'Story pinning requires an active subscription', 403);
            }

            const subscription = await Subscription.findById(outlet.subscription_id);
            if (!subscription) {
                return sendError(res, 'Subscription not found', 403);
            }

            if (subscription.status !== 'active' && subscription.status !== 'trial') {
                return sendError(res, `Subscription is ${subscription.status}. Story pinning requires an active subscription.`, 403);
            }

            // Check if the subscription plan includes story pinning feature
            if (!hasFeature(subscription.plan, SUBSCRIPTION_FEATURES.STORY_PINNING)) {
                return sendError(res, 'Story pinning is a premium feature. Upgrade your subscription to pin stories.', 403);
            }

            // If pinning this story, unpin all other stories for this outlet
            await Story.updateMany(
                { outletId: actualOutletId, _id: { $ne: null } },
                { $set: { pinned: false } }
            );
        }

        // 4. Create Story
        // Default visibility: Start now, End in 24h if not specified
        const start = visibilityStart ? new Date(visibilityStart) : new Date();
        const end = visibilityEnd ? new Date(visibilityEnd) : new Date(start.getTime() + 24 * 60 * 60 * 1000);

        const story = await Story.create({
            outletId: actualOutletId,
            slides: processedSlides,
            category,
            status: 'live', // Auto-publish for now, or use 'draft' if requested
            pinned: pinned || false,
            visibilityStart: start,
            visibilityEnd: end,
            createdBy: req.user.id
        });

        // 5. Initialize Metrics
        await StoryMetrics.create({
            storyId: story._id,
            outletId: actualOutletId
        });

        return sendSuccess(res, story, 'Story created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getStoryFeed = async (req: Request, res: Response) => {
    try {
        const { latitude, longitude, radius = DEFAULT_RADIUS, userId } = req.query;
        const now = new Date();

        // Use aggregation pipeline for better performance
        const pipeline: any[] = [
            // 1. Match active/approved outlets (with optional geospatial filter)
            {
                $match: {
                    status: 'ACTIVE',
                    approval_status: 'APPROVED'
                }
            }
        ];

        // Add geospatial filtering if coordinates provided
        if (latitude && longitude) {
            pipeline.unshift({
                $geoNear: {
                    near: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude as string), parseFloat(latitude as string)]
                    },
                    distanceField: 'distance',
                    maxDistance: parseInt(radius as string),
                    query: { status: 'ACTIVE', approval_status: 'APPROVED' },
                    spherical: true
                }
            });
        } else {
            pipeline.push({ $limit: DEFAULT_OUTLET_LIMIT });
        }

        // 2. Project only needed outlet fields early
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

        // 3. Lookup stories for these outlets
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
                        { $sort: { created_at: -1 } }
                    ],
                    as: 'stories'
                }
            },
            // Filter out outlets with no stories
            { $match: { stories: { $ne: [] } } }
        );

        // 4. Lookup brand info
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

        const outlets = await Outlet.aggregate(pipeline);

        if (outlets.length === 0) {
            return sendSuccess(res, []);
        }

        // 5. Get user's viewed stories if userId provided
        let viewedStoryIds = new Set<string>();
        if (userId) {
            const viewedStories = await StoryView.find({ userId }).select('storyId').lean();
            viewedStoryIds = new Set(viewedStories.map(v => v.storyId.toString()));
        }

        // 6. Format response with viewed status
        const feed = outlets.map((outlet: any) => {
            const stories = outlet.stories.map((story: any) => ({
                ...story,
                isSeen: viewedStoryIds.has(story._id.toString())
            }));

            return {
                outlet: {
                    _id: outlet._id,
                    name: outlet.name,
                    slug: outlet.slug,
                    media: outlet.media,
                    location: outlet.location,
                    address: outlet.address,
                    status: outlet.status,
                    approval_status: outlet.approval_status,
                    brand_id: outlet.brand
                },
                stories,
                latestUpdate: stories[0]?.created_at || new Date(),
                hasUnseen: stories.some((s: any) => !s.isSeen)
            };
        });

        return sendSuccess(res, feed);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getOutletStories = async (req: Request, res: Response) => {
    try {
        const { outletId: idOrSlug } = req.params;
        const now = new Date();

        const outlet = await outletService.getOutletById(idOrSlug);
        if (!outlet) {
            return sendError(res, 'Outlet not found', STATUS_CODE_NOT_FOUND);
        }
        const actualOutletId = outlet._id;

        const stories = await Story.find({
            outletId: actualOutletId,
            status: 'live',
            visibilityStart: { $lte: now },
            visibilityEnd: { $gt: now }
        })
            .populate({
                path: 'outletId',
                select: 'name slug media.cover_image_url location address status approval_status brand_id',
                populate: {
                    path: 'brand_id',
                    select: 'name verification_status'
                }
            })
            .sort({ created_at: 1 }); // Oldest first (chronological order usually)

        return sendSuccess(res, stories);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const updateStoryStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { storyId } = req.params;
        const { status, pinned } = req.body;

        const story = await Story.findById(storyId);
        if (!story) return sendError(res, 'Story not found', STATUS_CODE_NOT_FOUND);

        if (!req.user || !await checkOutletAccess(req.user, story.outletId.toString())) {
            return sendError(res, 'Unauthorized', STATUS_CODE_FORBIDDEN);
        }

        if (status) story.status = status;

        if (typeof pinned === 'boolean' && pinned) {
            try {
                const outlet = await Outlet.findById(story.outletId);
                await validateStoryPinning(outlet);
                await unpinOtherStories(story.outletId.toString(), story._id);
                story.pinned = true;
            } catch (error: any) {
                return sendError(res, error.message, STATUS_CODE_FORBIDDEN);
            }
        } else if (typeof pinned === 'boolean') {
            story.pinned = pinned;
        }

        await story.save();
        return sendSuccess(res, story, 'Story updated');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const deleteStory = async (req: AuthRequest, res: Response) => {
    try {
        const { storyId } = req.params;

        const story = await Story.findById(storyId);
        if (!story) return sendError(res, 'Story not found', STATUS_CODE_NOT_FOUND);

        if (!req.user || !await checkOutletAccess(req.user, story.outletId.toString())) {
            return sendError(res, 'Unauthorized', STATUS_CODE_FORBIDDEN);
        }

        const mediaUrls = story.slides
            .map(slide => slide.mediaUrl)
            .filter((url): url is string => Boolean(url) && url.includes('cloudinary.com'));

        await Story.deleteOne({ _id: storyId });
        await StoryMetrics.deleteOne({ storyId: storyId });

        if (mediaUrls.length > 0) {
            for (const url of mediaUrls) {
                const isVideo = url.includes('/video/upload/');
                const resourceType = isVideo ? 'video' : 'image';

                const { deleteFromCloudinary } = await import('../services/cloudinaryService.js');
                await deleteFromCloudinary(url, resourceType);
            }
        }

        return sendSuccess(res, null, 'Story deleted');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const recordView = async (req: Request, res: Response) => {
    try {
        const { storyId } = req.params;
        const { userId, completedAllSlides } = req.body;

        if (!userId) {
            return sendError(res, 'userId is required', STATUS_CODE_BAD_REQUEST);
        }

        const story = await Story.findById(storyId);
        if (!story) {
            return sendError(res, 'Story not found', STATUS_CODE_NOT_FOUND);
        }

        // Check if user has already viewed this story
        const existingView = await StoryView.findOne({ userId, storyId }).lean();
        const isUniqueView = !existingView;

        // Create or update user's view record
        await StoryView.findOneAndUpdate(
            { userId, storyId },
            {
                outletId: story.outletId,
                viewedAt: new Date(),
                completedAllSlides: completedAllSlides || false
            },
            { upsert: true, new: true }
        );

        // Increment metrics
        const update: any = { $inc: { totalViews: 1 } };
        if (isUniqueView) {
            update.$inc.uniqueViews = 1;
        }

        await StoryMetrics.findOneAndUpdate(
            { storyId },
            update,
            { upsert: true }
        );

        return sendSuccess(res, { isFirstView: isUniqueView }, 'View recorded');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getSeenStatus = async (req: Request, res: Response) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return sendError(res, 'userId is required', STATUS_CODE_BAD_REQUEST);
        }

        const viewedStories = await StoryView.find({ userId }).select('storyId outletId viewedAt');
        return sendSuccess(res, viewedStories);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getStoryAnalytics = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId: idOrSlug } = req.params;

        const outlet = await outletService.getOutletById(idOrSlug);
        if (!outlet) {
            return sendError(res, 'Outlet not found', STATUS_CODE_NOT_FOUND);
        }
        const actualOutletId = outlet._id;

        if (!req.user || !await checkOutletAccess(req.user, actualOutletId.toString())) {
            return sendError(res, 'Unauthorized', STATUS_CODE_FORBIDDEN);
        }

        const metrics = await StoryMetrics.find({ outletId: actualOutletId }).populate('storyId', 'slides category created_at status');

        return sendSuccess(res, metrics);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};
