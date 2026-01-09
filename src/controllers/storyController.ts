import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Story, IStory } from '../models/Story.js';
import { StoryMetrics } from '../models/StoryMetrics.js';
import { StoryView } from '../models/StoryView.js';
import { Outlet } from '../models/Outlet.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { saveBase64Image } from '../utils/fileUpload.js';
import { AuthRequest } from '../middleware/authMiddleware.js';

// --- Helpers ---

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
        const { outletId, slides, category, visibilityStart, visibilityEnd, pinned } = req.body;

        if (!outletId || !slides || slides.length === 0 || !category) {
            return sendError(res, 'Missing required fields (outletId, slides, category)', 400);
        }

        // 1. Permission Check
        if (!req.user || !await checkOutletAccess(req.user, outletId)) {
            return sendError(res, 'Unauthorized to create story for this outlet', 403);
        }

        // 2. Validate Limits (Max stories per day)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const storiesToday = await Story.countDocuments({
            outletId,
            created_at: { $gte: today }
        });

        const MAX_STORIES_PER_DAY = 10; // Configurable
        if (storiesToday >= MAX_STORIES_PER_DAY) {
            return sendError(res, `Daily story limit reached (${MAX_STORIES_PER_DAY})`, 400);
        }

        const normalizePoint = (value: any): { x: number; y: number } | undefined => {
            if (!value || typeof value !== 'object') return undefined;
            const x = typeof value.x === 'number' ? value.x : undefined;
            const y = typeof value.y === 'number' ? value.y : undefined;
            if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
            return { x, y };
        };

        // 3. Process Slides (Upload Media)
        const processedSlides = await Promise.all(slides.map(async (slide: any, index: number) => {
            let mediaUrl = slide.mediaUrl;
            if (mediaUrl && mediaUrl.startsWith('data:')) {
                const uploadResult = await saveBase64Image(mediaUrl, 'stories');
                mediaUrl = uploadResult.url;
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

        // 4. Create Story
        // Default visibility: Start now, End in 24h if not specified
        const start = visibilityStart ? new Date(visibilityStart) : new Date();
        const end = visibilityEnd ? new Date(visibilityEnd) : new Date(start.getTime() + 24 * 60 * 60 * 1000);

        const story = await Story.create({
            outletId,
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
            outletId: outletId
        });

        return sendSuccess(res, story, 'Story created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getStoryFeed = async (req: Request, res: Response) => {
    try {
        const { latitude, longitude, radius = 10000, userId } = req.query;
        const now = new Date();

        // 1. Find nearby outlets (if location provided) - only approved and active outlets
        let outletIds: mongoose.Types.ObjectId[] = [];
        const outletQuery: any = {
            status: 'ACTIVE',
            approval_status: 'APPROVED'
        };
        
        if (latitude && longitude) {
            outletQuery.location = {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude as string), parseFloat(latitude as string)]
                    },
                    $maxDistance: parseInt(radius as string)
                }
            };
            const outlets = await Outlet.find(outletQuery).select('_id');
            outletIds = outlets.map(o => o._id);
        } else {
            // If no location, just get all approved outlets (or top N)
            const outlets = await Outlet.find(outletQuery).limit(50).select('_id');
            outletIds = outlets.map(o => o._id);
        }

        if (outletIds.length === 0) {
            return sendSuccess(res, []);
        }

        // 2. Find live stories for these outlets
        const stories = await Story.find({
            outletId: { $in: outletIds },
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
        .sort({ created_at: -1 });

        // 3. Get user's viewed stories if userId provided
        let viewedStoryIds = new Set<string>();
        if (userId) {
            const viewedStories = await StoryView.find({ userId }).select('storyId');
            viewedStoryIds = new Set(viewedStories.map(v => v.storyId.toString()));
        }

        // 4. Group by outlet and check if outlet has unseen stories
        const feedMap = new Map<string, any>();
        for (const story of stories) {
            const outletIdStr = (story.outletId as any)._id.toString();
            const storyIdStr = story._id.toString();
            const isSeen = viewedStoryIds.has(storyIdStr);
            
            if (!feedMap.has(outletIdStr)) {
                feedMap.set(outletIdStr, {
                    outlet: story.outletId,
                    stories: [],
                    latestUpdate: story.created_at,
                    hasUnseen: false
                });
            }
            
            feedMap.get(outletIdStr)!.stories.push(story);
            
            // If any story is unseen, mark outlet as having unseen content
            if (!isSeen) {
                feedMap.get(outletIdStr)!.hasUnseen = true;
            }
        }

        const feed = Array.from(feedMap.values());
        return sendSuccess(res, feed);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getOutletStories = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const now = new Date();

        const stories = await Story.find({
            outletId,
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
        const { status, pinned } = req.body; // status: 'archived', 'live', etc.

        const story = await Story.findById(storyId);
        if (!story) return sendError(res, 'Story not found', 404);

        // Permission check
        if (!req.user || !await checkOutletAccess(req.user, story.outletId.toString())) {
            return sendError(res, 'Unauthorized', 403);
        }

        if (status) story.status = status;
        if (typeof pinned === 'boolean') story.pinned = pinned;

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
        if (!story) return sendError(res, 'Story not found', 404);

        if (!req.user || !await checkOutletAccess(req.user, story.outletId.toString())) {
            return sendError(res, 'Unauthorized', 403);
        }

        // Soft delete (archive) or hard delete?
        // Let's hard delete for now or set to archived. 
        // User asked for "status states: draft -> scheduled -> live -> expired -> archived"
        // And "outlet deleted -> archive stories".
        // Explicit delete usually means remove.
        await Story.deleteOne({ _id: storyId });
        await StoryMetrics.deleteOne({ storyId: storyId });

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
            return sendError(res, 'userId is required', 400);
        }

        // Get story to find outletId
        const story = await Story.findById(storyId);
        if (!story) {
            return sendError(res, 'Story not found', 404);
        }

        // Check if user has already viewed this story
        const existingView = await StoryView.findOne({ userId, storyId });
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

// Get seen status for user (which stories they've viewed)
export const getSeenStatus = async (req: Request, res: Response) => {
    try {
        const { userId } = req.query;
        
        if (!userId) {
            return sendError(res, 'userId is required', 400);
        }

        // Get all story IDs the user has viewed
        const viewedStories = await StoryView.find({ userId }).select('storyId outletId viewedAt');
        
        return sendSuccess(res, viewedStories);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getStoryAnalytics = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        
        if (!req.user || !await checkOutletAccess(req.user, outletId)) {
            return sendError(res, 'Unauthorized', 403);
        }

        const metrics = await StoryMetrics.find({ outletId }).populate('storyId', 'slides category created_at status');
        
        return sendSuccess(res, metrics);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};
