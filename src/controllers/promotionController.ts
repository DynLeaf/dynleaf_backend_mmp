import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { FeaturedPromotion } from '../models/FeaturedPromotion.js';
import { Outlet } from '../models/Outlet.js';
import { PromotionEvent } from '../models/PromotionEvent.js';
import { PromotionAnalyticsSummary } from '../models/PromotionAnalyticsSummary.js';
import { sendSuccess, sendError } from '../utils/response.js';

// Create a new promotion
export const createPromotion = async (req: Request, res: Response) => {
    try {
        const {
            outlet_id,
            promotion_type,
            display_data,
            scheduling,
            targeting,
            payment
        } = req.body;

        // Validate outlet exists
        const outlet = await Outlet.findById(outlet_id);
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        // Check for overlapping active promotions for the same outlet
        const overlapping = await FeaturedPromotion.findOne({
            outlet_id,
            is_active: true,
            $or: [
                {
                    'scheduling.start_date': { $lte: scheduling.end_date },
                    'scheduling.end_date': { $gte: scheduling.start_date }
                }
            ]
        });

        if (overlapping) {
            return sendError(res, 'Outlet already has an active promotion during this period', 400);
        }

        const promotion = await FeaturedPromotion.create({
            outlet_id,
            promotion_type: promotion_type || 'featured_today',
            display_data: {
                title: display_data.title,
                subtitle: display_data.subtitle,
                banner_image_url: display_data.banner_image_url,
                badge_text: display_data.badge_text || 'Sponsored'
            },
            scheduling: {
                start_date: new Date(scheduling.start_date),
                end_date: new Date(scheduling.end_date),
                display_priority: scheduling.display_priority || 50
            },
            targeting: {
                locations: targeting?.locations || [],
                show_on_homepage: targeting?.show_on_homepage !== false
            },
            payment: payment ? {
                amount_paid: payment.amount_paid || 0,
                payment_status: payment.payment_status || 'pending',
                payment_date: payment.payment_date ? new Date(payment.payment_date) : undefined
            } : undefined,
            is_active: true,
            created_by: outlet.created_by_user_id // Use the outlet owner as creator
        });

        const populatedPromotion = await FeaturedPromotion.findById(promotion._id)
            .populate('outlet_id', 'name slug logo_url address')
            .populate('created_by', 'username email');

        return sendSuccess(res, {
            promotion: populatedPromotion
        }, null, 201);
    } catch (error: any) {
        console.error('Create promotion error:', error);
        return sendError(res, error.message || 'Failed to create promotion');
    }
};

// Get all promotions (with filters)
export const getPromotions = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;
        
        const status = req.query.status as string; // 'active', 'scheduled', 'expired', 'inactive'
        const outlet_id = req.query.outlet_id as string;

        const query: any = {};

        // Filter by outlet
        if (outlet_id) {
            query.outlet_id = outlet_id;
        }

        // Filter by status
        const now = new Date();
        if (status === 'active') {
            query.is_active = true;
            query['scheduling.start_date'] = { $lte: now };
            query['scheduling.end_date'] = { $gte: now };
        } else if (status === 'scheduled') {
            query.is_active = true;
            query['scheduling.start_date'] = { $gt: now };
        } else if (status === 'expired') {
            query['scheduling.end_date'] = { $lt: now };
        } else if (status === 'inactive') {
            query.is_active = false;
        }

        const [promotions, total] = await Promise.all([
            FeaturedPromotion.find(query)
                .populate('outlet_id', 'name slug logo_url address')
                .populate('created_by', 'username email')
                .sort({ 'scheduling.display_priority': -1, created_at: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            FeaturedPromotion.countDocuments(query)
        ]);

        return sendSuccess(res, {
            promotions,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error: any) {
        console.error('Get promotions error:', error);
        return sendError(res, error.message || 'Failed to fetch promotions');
    }
};

// Get single promotion
export const getPromotion = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const promotion = await FeaturedPromotion.findById(id)
            .populate('outlet_id', 'name slug logo_url address contact')
            .populate('created_by', 'username email');

        if (!promotion) {
            return sendError(res, 'Promotion not found', 404);
        }

        return sendSuccess(res, { promotion });
    } catch (error: any) {
        console.error('Get promotion error:', error);
        return sendError(res, error.message || 'Failed to fetch promotion');
    }
};

// Update promotion
export const updatePromotion = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const promotion = await FeaturedPromotion.findById(id);
        if (!promotion) {
            return sendError(res, 'Promotion not found', 404);
        }

        // If updating scheduling, check for overlaps
        if (updates.scheduling) {
            const overlapping = await FeaturedPromotion.findOne({
                _id: { $ne: id },
                outlet_id: promotion.outlet_id,
                is_active: true,
                $or: [
                    {
                        'scheduling.start_date': { $lte: new Date(updates.scheduling.end_date) },
                        'scheduling.end_date': { $gte: new Date(updates.scheduling.start_date) }
                    }
                ]
            });

            if (overlapping) {
                return sendError(res, 'Scheduling conflict with another active promotion', 400);
            }
        }

        // Update fields
        if (updates.display_data) {
            promotion.display_data = { ...promotion.display_data, ...updates.display_data };
        }
        if (updates.scheduling) {
            promotion.scheduling = { ...promotion.scheduling, ...updates.scheduling };
        }
        if (updates.targeting) {
            promotion.targeting = { ...promotion.targeting, ...updates.targeting };
        }
        if (updates.payment) {
            promotion.payment = { ...promotion.payment, ...updates.payment };
        }
        if (updates.promotion_type !== undefined) {
            promotion.promotion_type = updates.promotion_type;
        }
        if (updates.is_active !== undefined) {
            promotion.is_active = updates.is_active;
        }

        await promotion.save();

        const updatedPromotion = await FeaturedPromotion.findById(id)
            .populate('outlet_id', 'name slug logo_url address')
            .populate('created_by', 'username email');

        return sendSuccess(res, { promotion: updatedPromotion });
    } catch (error: any) {
        console.error('Update promotion error:', error);
        return sendError(res, error.message || 'Failed to update promotion');
    }
};

// Toggle promotion status
export const togglePromotionStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const promotion = await FeaturedPromotion.findById(id);
        if (!promotion) {
            return sendError(res, 'Promotion not found', 404);
        }

        promotion.is_active = !promotion.is_active;
        await promotion.save();

        return sendSuccess(res, {
            promotion,
            message: `Promotion ${promotion.is_active ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error: any) {
        console.error('Toggle promotion status error:', error);
        return sendError(res, error.message || 'Failed to toggle promotion status');
    }
};

// Delete promotion
export const deletePromotion = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const promotion = await FeaturedPromotion.findByIdAndDelete(id);
        if (!promotion) {
            return sendError(res, 'Promotion not found', 404);
        }

        return sendSuccess(res, { message: 'Promotion deleted successfully' });
    } catch (error: any) {
        console.error('Delete promotion error:', error);
        return sendError(res, error.message || 'Failed to delete promotion');
    }
};

// Get promotion analytics with time-series data
export const getPromotionAnalytics = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { date_from, date_to } = req.query;

        const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        const startOfNextUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
        const utcDateKey = (d: Date) => d.toISOString().slice(0, 10);

        const promotion = await FeaturedPromotion.findById(id)
            .populate('outlet_id', 'name slug logo_url');

        if (!promotion) {
            return sendError(res, 'Promotion not found', 404);
        }

        // Default to last 30 days
        const fallbackFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const fallbackTo = new Date();
        const rawFrom = date_from ? new Date(date_from as string) : fallbackFrom;
        const rawTo = date_to ? new Date(date_to as string) : fallbackTo;
        const dateFrom = isNaN(rawFrom.getTime()) ? fallbackFrom : rawFrom;
        const dateTo = isNaN(rawTo.getTime()) ? fallbackTo : rawTo;

        // Normalize range to UTC day boundaries to avoid timezone drift.
        const rangeStart = startOfUtcDay(dateFrom);
        const rangeEndExclusive = startOfNextUtcDay(dateTo);

        // Fetch pre-aggregated summaries (daily)
        const summaries = await PromotionAnalyticsSummary.find({
            promotion_id: id,
            date: { $gte: rangeStart, $lt: rangeEndExclusive }
        }).sort({ date: 1 });

        // Build daily map from summaries
        const dailyByKey = new Map<string, {
            dateKey: string;
            impressions: number;
            clicks: number;
            menu_views: number;
            unique_sessions: number;
            ctr: number;
            conversion_rate: number;
            device_breakdown: { mobile: number; desktop: number; tablet: number };
            hourly_breakdown: Array<{ hour: number; impressions: number; clicks: number }>;
            location_breakdown?: Map<string, number>;
        }>();

        for (const s of summaries) {
            const key = utcDateKey(s.date);
            dailyByKey.set(key, {
                dateKey: key,
                impressions: s.metrics.impressions,
                clicks: s.metrics.clicks,
                menu_views: s.metrics.menu_views,
                unique_sessions: s.metrics.unique_sessions,
                ctr: s.metrics.ctr,
                conversion_rate: s.metrics.conversion_rate,
                device_breakdown: s.device_breakdown,
                hourly_breakdown: s.hourly_breakdown,
                location_breakdown: s.location_breakdown as any
            });
        }

        // Backfill recent days from raw events so analytics update even if cron hasn't run.
        // We keep this intentionally small (today + yesterday) to avoid heavy queries.
        const now = new Date();
        const todayStartUtc = startOfUtcDay(now);
        const yesterdayStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));

        const promotionObjectId = new mongoose.Types.ObjectId(id);
        const recentDayStarts = [yesterdayStartUtc, todayStartUtc];

        for (const dayStart of recentDayStarts) {
            if (dayStart.getTime() < rangeStart.getTime() || dayStart.getTime() >= rangeEndExclusive.getTime()) {
                continue;
            }

            const dayKey = utcDateKey(dayStart);
            const dayEnd = startOfNextUtcDay(dayStart);

            // If we already have a summary for a past day, keep it; for today, prefer live data.
            const shouldOverride = dayStart.getTime() === todayStartUtc.getTime();
            if (!shouldOverride && dailyByKey.has(dayKey)) {
                continue;
            }

            const liveEvents = await PromotionEvent.aggregate([
                {
                    $match: {
                        promotion_id: promotionObjectId,
                        timestamp: { $gte: dayStart, $lt: dayEnd }
                    }
                },
                {
                    $group: {
                        _id: {
                            event_type: '$event_type',
                            device_type: '$device_type',
                            hour: { $hour: '$timestamp' }
                        },
                        count: { $sum: 1 },
                        unique_sessions: { $addToSet: '$session_id' }
                    }
                }
            ]);

            if (liveEvents.length === 0) {
                continue;
            }

            const impressions = liveEvents
                .filter(e => e._id.event_type === 'impression')
                .reduce((sum, e) => sum + e.count, 0);

            const clicks = liveEvents
                .filter(e => e._id.event_type === 'click')
                .reduce((sum, e) => sum + e.count, 0);

            const menu_views = liveEvents
                .filter(e => e._id.event_type === 'menu_view')
                .reduce((sum, e) => sum + e.count, 0);

            const allUniqueSessions = new Set(
                liveEvents.flatMap((e: any) => e.unique_sessions)
            );

            const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
            const conversion_rate = clicks > 0 ? (menu_views / clicks) * 100 : 0;

            const device_breakdown = {
                mobile: liveEvents
                    .filter(e => e._id.device_type === 'mobile')
                    .reduce((sum, e) => sum + e.count, 0),
                desktop: liveEvents
                    .filter(e => e._id.device_type === 'desktop')
                    .reduce((sum, e) => sum + e.count, 0),
                tablet: liveEvents
                    .filter(e => e._id.device_type === 'tablet')
                    .reduce((sum, e) => sum + e.count, 0)
            };

            const hourly_breakdown = Array.from({ length: 24 }, (_, hour) => {
                const hourEvents = liveEvents.filter(e => e._id.hour === hour);
                return {
                    hour,
                    impressions: hourEvents
                        .filter(e => e._id.event_type === 'impression')
                        .reduce((sum, e) => sum + e.count, 0),
                    clicks: hourEvents
                        .filter(e => e._id.event_type === 'click')
                        .reduce((sum, e) => sum + e.count, 0)
                };
            });

            dailyByKey.set(dayKey, {
                dateKey: dayKey,
                impressions,
                clicks,
                menu_views,
                unique_sessions: allUniqueSessions.size,
                ctr: parseFloat(ctr.toFixed(2)),
                conversion_rate: parseFloat(conversion_rate.toFixed(2)),
                device_breakdown,
                hourly_breakdown
            });
        }

        // Calculate totals
        const totals = {
            impressions: 0,
            clicks: 0,
            menu_views: 0,
            unique_sessions: 0,
            ctr: 0,
            conversion_rate: 0
        };

        const deviceTotals = { mobile: 0, desktop: 0, tablet: 0 };
        const locationTotals: { [key: string]: number } = {};

        for (const [, day] of dailyByKey) {
            totals.impressions += day.impressions;
            totals.clicks += day.clicks;
            totals.menu_views += day.menu_views;
            totals.unique_sessions += day.unique_sessions;

            deviceTotals.mobile += day.device_breakdown.mobile;
            deviceTotals.desktop += day.device_breakdown.desktop;
            deviceTotals.tablet += day.device_breakdown.tablet;

            if (day.location_breakdown) {
                const locMap = day.location_breakdown;
                locMap.forEach((count, city) => {
                    locationTotals[city] = (locationTotals[city] || 0) + count;
                });
            }
        }

        // Calculate rates
        if (totals.impressions > 0) {
            totals.ctr = parseFloat(((totals.clicks / totals.impressions) * 100).toFixed(2));
        }
        if (totals.clicks > 0) {
            totals.conversion_rate = parseFloat(((totals.menu_views / totals.clicks) * 100).toFixed(2));
        }

        // Daily breakdown (sorted) and hourly pattern from most recent day
        const daily_breakdown_sorted = Array.from(dailyByKey.values())
            .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
            .map(d => ({
                date: `${d.dateKey}T00:00:00.000Z`,
                impressions: d.impressions,
                clicks: d.clicks,
                menu_views: d.menu_views,
                ctr: d.ctr,
                conversion_rate: d.conversion_rate
            }));

        const mostRecent = daily_breakdown_sorted.length > 0
            ? daily_breakdown_sorted[daily_breakdown_sorted.length - 1]
            : null;

        const mostRecentKey = mostRecent ? mostRecent.date.slice(0, 10) : null;
        const hourly_pattern = mostRecentKey && dailyByKey.get(mostRecentKey)
            ? dailyByKey.get(mostRecentKey)!.hourly_breakdown
            : [];

        return sendSuccess(res, {
            summary: totals,
            daily_breakdown: daily_breakdown_sorted,
            device_breakdown: deviceTotals,
            location_breakdown: locationTotals,
            hourly_pattern,
            outlet: promotion.outlet_id
        });
    } catch (error: any) {
        console.error('Get promotion analytics error:', error);
        return sendError(res, error.message || 'Failed to fetch analytics');
    }
};

// Track impression (public endpoint)
export const trackImpression = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { session_id } = req.body;

        const promotion = await FeaturedPromotion.findById(id).populate('outlet_id');
        if (!promotion) {
            return sendError(res, 'Promotion not found', 404);
        }

        // Detect device type from user agent
        const userAgent = req.headers['user-agent'] || '';
        let device_type: 'mobile' | 'desktop' | 'tablet' = 'desktop';
        if (/mobile/i.test(userAgent) && !/tablet|ipad/i.test(userAgent)) {
            device_type = 'mobile';
        } else if (/tablet|ipad/i.test(userAgent)) {
            device_type = 'tablet';
        }

        // Get IP address
        const ip_address = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress;

        const sid = session_id || 'anonymous';

        // Dedupe: only count 1 impression per promotion per session per UTC day.
        // (Skip dedupe when session_id is missing to avoid collapsing all traffic into 'anonymous'.)
        if (session_id) {
            const now = new Date();
            const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

            const existing = await PromotionEvent.findOne({
                promotion_id: promotion._id,
                event_type: 'impression',
                session_id: sid,
                timestamp: { $gte: startUtc, $lt: endUtc },
            }).select('_id');

            if (existing) {
                return sendSuccess(res, { tracked: false, deduped: true });
            }
        }

        // Save detailed event
        await PromotionEvent.create({
            promotion_id: promotion._id,
            outlet_id: promotion.outlet_id,
            event_type: 'impression',
            session_id: sid,
            device_type,
            user_agent: userAgent,
            ip_address,
            timestamp: new Date()
        });

        // Also increment counter for backward compatibility
        await FeaturedPromotion.findByIdAndUpdate(
            id,
            { $inc: { 'analytics.impressions': 1 } }
        );

        return sendSuccess(res, { tracked: true });
    } catch (error: any) {
        console.error('Track impression error:', error);
        return sendError(res, error.message || 'Failed to track impression');
    }
};

// Track click (public endpoint)
export const trackClick = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { session_id } = req.body;

        const promotion = await FeaturedPromotion.findById(id).populate('outlet_id');
        if (!promotion) {
            return sendError(res, 'Promotion not found', 404);
        }

        // Detect device type
        const userAgent = req.headers['user-agent'] || '';
        let device_type: 'mobile' | 'desktop' | 'tablet' = 'desktop';
        if (/mobile/i.test(userAgent) && !/tablet|ipad/i.test(userAgent)) {
            device_type = 'mobile';
        } else if (/tablet|ipad/i.test(userAgent)) {
            device_type = 'tablet';
        }

        const ip_address = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress;

        // Save detailed event
        await PromotionEvent.create({
            promotion_id: promotion._id,
            outlet_id: promotion.outlet_id,
            event_type: 'click',
            session_id: session_id || 'anonymous',
            device_type,
            user_agent: userAgent,
            ip_address,
            timestamp: new Date()
        });

        // Increment counter for backward compatibility
        await FeaturedPromotion.findByIdAndUpdate(
            id,
            { $inc: { 'analytics.clicks': 1 } }
        );

        // Update CTR (legacy field misnamed as conversion_rate)
        const updatedPromo = await FeaturedPromotion.findById(id);
        if (updatedPromo && updatedPromo.analytics.impressions > 0) {
            // Note: This field is misnamed - it's actually CTR, not conversion rate
            // Real analytics use PromotionAnalyticsSummary model
            const ctr = (updatedPromo.analytics.clicks / updatedPromo.analytics.impressions) * 100;
            updatedPromo.analytics.conversion_rate = Math.min(ctr, 100); // Cap at 100%
            await updatedPromo.save();
        }

        return sendSuccess(res, { tracked: true });
    } catch (error: any) {
        console.error('Track click error:', error);
        return sendError(res, error.message || 'Failed to track click');
    }
};

// Get active featured promotions for homepage (public)
export const getFeaturedPromotions = async (req: Request, res: Response) => {
    try {
        const location = req.query.location as string;
        const limit = parseInt(req.query.limit as string) || 5;

        const now = new Date();
        const query: any = {
            is_active: true,
            'scheduling.start_date': { $lte: now },
            'scheduling.end_date': { $gte: now },
            'targeting.show_on_homepage': true
        };

        // Filter by location if provided
        if (location) {
            query.$or = [
                { 'targeting.locations': { $size: 0 } }, // No location targeting
                { 'targeting.locations': location } // Matches location
            ];
        }

        const promotions = await FeaturedPromotion.find(query)
            .populate({
                path: 'outlet_id',
                select: 'name slug logo_url address location cuisines price_range avg_rating is_pure_veg',
                populate: {
                    path: 'brand_id',
                    select: 'name logo_url'
                }
            })
            .sort({ 'scheduling.display_priority': -1 })
            .limit(limit)
            .lean();

        return sendSuccess(res, { promotions });
    } catch (error: any) {
        console.error('Get featured promotions error:', error);
        return sendError(res, error.message || 'Failed to fetch featured promotions');
    }
};
