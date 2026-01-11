import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { FoodItemAnalyticsEvent } from '../models/FoodItemAnalyticsEvent.js';
import { OutletAnalyticsEvent } from '../models/OutletAnalyticsEvent.js';
import { PromotionEvent } from '../models/PromotionEvent.js';
import { FeaturedPromotion } from '../models/FeaturedPromotion.js';

import { sendSuccess, sendError } from '../utils/response.js';

const detectDeviceType = (userAgentRaw: string): 'mobile' | 'desktop' | 'tablet' => {
    const userAgent = userAgentRaw || '';
    if (/mobile/i.test(userAgent) && !/tablet|ipad/i.test(userAgent)) return 'mobile';
    if (/tablet|ipad/i.test(userAgent)) return 'tablet';
    return 'desktop';
};

const getIpAddress = (req: Request) =>
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress;

export const processAnalyticsBatch = async (req: Request, res: Response) => {
    try {
        const { events, metadata } = req.body;
        console.log(`[AnalyticsBatch] Received ${events?.length || 0} events. Metadata:`, metadata);

        if (!Array.isArray(events) || events.length === 0) {
            return sendSuccess(res, { processed: 0 });
        }

        const ip_address = getIpAddress(req);
        const user_agent = metadata?.user_agent || req.headers['user-agent'] || '';
        const device_type = detectDeviceType(user_agent);

        const foodItemEvents: any[] = [];
        const outletEvents: any[] = [];
        const promotionEvents: any[] = [];

        for (const event of events) {
            const { type, timestamp, payload } = event;

            const baseData = {
                session_id: metadata?.session_id || payload?.session_id || 'anonymous',
                device_type,
                user_agent,
                ip_address,
                timestamp: new Date(timestamp),
                source: payload?.source || 'other',
                source_context: payload?.source_context,
            };

            if (type.startsWith('item_') || type === 'add_to_cart' || type === 'order_created') {
                const outletObjectId = mongoose.Types.ObjectId.isValid(payload.outlet_id) ? new mongoose.Types.ObjectId(payload.outlet_id) : undefined;
                const foodItemObjectId = mongoose.Types.ObjectId.isValid(payload.food_item_id) ? new mongoose.Types.ObjectId(payload.food_item_id) : undefined;

                if (outletObjectId && foodItemObjectId) {
                    foodItemEvents.push({
                        ...baseData,
                        outlet_id: outletObjectId,
                        food_item_id: foodItemObjectId,
                        event_type: type.replace('item_', 'item_'), // item_impression -> item_impression
                    });
                }
            } else if (type === 'outlet_visit' || type === 'profile_view' || type === 'menu_view') {
                const outletObjectId = mongoose.Types.ObjectId.isValid(payload.outlet_id) ? new mongoose.Types.ObjectId(payload.outlet_id) : undefined;
                const promotionObjectId = payload.promotion_id && mongoose.Types.ObjectId.isValid(payload.promotion_id) ? new mongoose.Types.ObjectId(payload.promotion_id) : undefined;

                if (outletObjectId) {
                    outletEvents.push({
                        ...baseData,
                        outlet_id: outletObjectId,
                        event_type: type,
                        entry_page: payload.entry_page,
                        prev_path: payload.prev_path,
                        promotion_id: promotionObjectId,
                    });
                }
            } else if (type.startsWith('promo_')) {
                const promoObjectId = mongoose.Types.ObjectId.isValid(payload.promoId)
                    ? new mongoose.Types.ObjectId(payload.promoId)
                    : undefined;

                const outletObjectId = payload.outletId && mongoose.Types.ObjectId.isValid(payload.outletId)
                    ? new mongoose.Types.ObjectId(payload.outletId)
                    : undefined;

                if (promoObjectId) {
                    console.log(`[AnalyticsBatch] Identified promotion event: ${type} for promo ${promoObjectId}`);
                    promotionEvents.push({
                        ...baseData,
                        promotion_id: promoObjectId,
                        outlet_id: outletObjectId,
                        event_type: type.replace('promo_', ''), // promo_impression -> impression
                    });
                } else {
                    console.warn(`[AnalyticsBatch] Invalid promoId in payload:`, payload);
                }
            }
        }

        // Bulk Write Operations
        const promises = [];

        if (foodItemEvents.length > 0) {
            promises.push(FoodItemAnalyticsEvent.insertMany(foodItemEvents, { ordered: false }));
        }

        if (outletEvents.length > 0) {
            promises.push(OutletAnalyticsEvent.insertMany(outletEvents, { ordered: false }));
        }

        if (promotionEvents.length > 0) {
            console.log(`[AnalyticsBatch] Attempting to insert ${promotionEvents.length} promotion events`);
            promises.push(PromotionEvent.insertMany(promotionEvents, { ordered: false }));

            // Also increment counters in FeaturedPromotion for real-time display in Admin
            const promotionUpdates = promotionEvents.reduce((acc: any, event: any) => {
                const id = event.promotion_id.toString();
                if (!acc[id]) acc[id] = { impressions: 0, clicks: 0 };
                if (event.event_type === 'impression') acc[id].impressions++;
                else if (event.event_type === 'click') acc[id].clicks++;
                return acc;
            }, {});

            const bulkOps = Object.entries(promotionUpdates).map(([id, counts]: [string, any]) => ({
                updateOne: {
                    filter: { _id: new mongoose.Types.ObjectId(id) },
                    update: {
                        $inc: {
                            'analytics.impressions': counts.impressions,
                            'analytics.clicks': counts.clicks
                        }
                    }
                }
            }));

            if (bulkOps.length > 0) {
                promises.push(FeaturedPromotion.bulkWrite(bulkOps));
            }
        }

        const results = await Promise.allSettled(promises);

        // Log any failures
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`[AnalyticsBatch] Operation ${index} failed:`, result.reason);
            } else {
                console.log(`[AnalyticsBatch] Operation ${index} succeeded`);
            }
        });

        console.log(`[AnalyticsBatch] Processed: food=${foodItemEvents.length}, outlet=${outletEvents.length}, promo=${promotionEvents.length}`);

        return sendSuccess(res, {
            processed: events.length,
            food_items: foodItemEvents.length,
            outlets: outletEvents.length,
            promotions: promotionEvents.length
        });
    } catch (error: any) {
        console.error('Process analytics batch error:', error);
        return sendError(res, error.message || 'Failed to process analytics batch');
    }
};
