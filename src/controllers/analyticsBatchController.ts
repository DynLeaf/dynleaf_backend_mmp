import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { FoodItemAnalyticsEvent } from '../models/FoodItemAnalyticsEvent.js';
import { OutletAnalyticsEvent } from '../models/OutletAnalyticsEvent.js';
import { PromotionEvent } from '../models/PromotionEvent.js';
import { FeaturedPromotion } from '../models/FeaturedPromotion.js';
import { OfferEvent } from '../models/OfferEvent.js';
import { Offer } from '../models/Offer.js';

import { sendSuccess, sendError } from '../utils/response.js';

// Constants
const BATCH_PROCESSING_LIMITS = {
    MAX_EVENTS: 1000,
    MIN_EVENTS: 1,
} as const;

const EVENT_TYPE_PREFIXES = {
    ITEM: 'item_',
    PROMO: 'promo_',
    OFFER: 'offer_',
} as const;

const OUTLET_EVENT_TYPES = ['outlet_visit', 'profile_view', 'menu_view'] as const;
const ITEM_EVENT_TYPES = ['add_to_cart', 'order_created'] as const;

// Helper Functions
const detectDeviceType = (userAgentRaw: string): 'mobile' | 'desktop' | 'tablet' => {
    const userAgent = userAgentRaw || '';
    if (/mobile/i.test(userAgent) && !/tablet|ipad/i.test(userAgent)) return 'mobile';
    if (/tablet|ipad/i.test(userAgent)) return 'tablet';
    return 'desktop';
};

const getIpAddress = (req: Request) =>
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress;

const toObjectId = (id: string): mongoose.Types.ObjectId | undefined =>
    mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : undefined;

const isItemEvent = (type: string): boolean =>
    type.startsWith(EVENT_TYPE_PREFIXES.ITEM) || ITEM_EVENT_TYPES.includes(type as any);

const isOutletEvent = (type: string): boolean =>
    OUTLET_EVENT_TYPES.includes(type as any);

const isPromoEvent = (type: string): boolean =>
    type.startsWith(EVENT_TYPE_PREFIXES.PROMO);

const isOfferEvent = (type: string): boolean =>
    type.startsWith(EVENT_TYPE_PREFIXES.OFFER);

// Event Mappers
const createBaseEventData = (metadata: any, payload: any, timestamp: string, req: Request) => ({
    session_id: metadata?.session_id || payload?.session_id || 'anonymous',
    device_type: detectDeviceType(metadata?.user_agent || req.headers['user-agent'] || ''),
    user_agent: metadata?.user_agent || req.headers['user-agent'] || '',
    ip_address: getIpAddress(req),
    timestamp: new Date(timestamp),
    source: payload?.source || 'other',
    source_context: payload?.source_context,
});

const createFoodItemEvent = (baseData: any, payload: any, type: string) => {
    const outletObjectId = toObjectId(payload.outlet_id);
    const foodItemObjectId = toObjectId(payload.food_item_id);

    if (!outletObjectId || !foodItemObjectId) return null;

    return {
        ...baseData,
        outlet_id: outletObjectId,
        food_item_id: foodItemObjectId,
        event_type: type.replace(EVENT_TYPE_PREFIXES.ITEM, EVENT_TYPE_PREFIXES.ITEM),
    };
};

const createOutletEvent = (baseData: any, payload: any, type: string) => {
    const outletObjectId = toObjectId(payload.outlet_id);
    const promotionObjectId = toObjectId(payload.promotion_id);

    if (!outletObjectId) return null;

    return {
        ...baseData,
        outlet_id: outletObjectId,
        event_type: type,
        entry_page: payload.entry_page,
        prev_path: payload.prev_path,
        promotion_id: promotionObjectId,
    };
};

const createPromoEvent = (baseData: any, payload: any, type: string) => {
    const promoObjectId = toObjectId(payload.promoId);
    const outletObjectId = toObjectId(payload.outletId);

    if (!promoObjectId) {
        console.warn(`[AnalyticsBatch] Invalid promoId in payload:`, payload);
        return null;
    }

    console.log(`[AnalyticsBatch] Identified promotion event: ${type} for promo ${promoObjectId}`);
    return {
        ...baseData,
        promotion_id: promoObjectId,
        outlet_id: outletObjectId,
        event_type: type.replace(EVENT_TYPE_PREFIXES.PROMO, ''),
    };
};

const createOfferEvent = (baseData: any, payload: any, type: string) => {
    const offerObjectId = toObjectId(payload.offerId);
    const outletObjectId = toObjectId(payload.outletId);

    if (!offerObjectId) {
        console.warn(`[AnalyticsBatch] Invalid offerId in payload:`, payload);
        return null;
    }

    console.log(`[AnalyticsBatch] Identified offer event: ${type} for offer ${offerObjectId}`);
    return {
        ...baseData,
        offer_id: offerObjectId,
        outlet_id: outletObjectId,
        event_type: type.replace(EVENT_TYPE_PREFIXES.OFFER, ''),
    };
};

const aggregatePromotionUpdates = (events: any[]) => {
    return events.reduce((acc: any, event: any) => {
        const id = event.promotion_id.toString();
        if (!acc[id]) acc[id] = { impressions: 0, clicks: 0 };
        if (event.event_type === 'impression') acc[id].impressions++;
        else if (event.event_type === 'click') acc[id].clicks++;
        return acc;
    }, {});
};

const aggregateOfferUpdates = (events: any[]) => {
    return events.reduce((acc: any, event: any) => {
        const id = event.offer_id.toString();
        if (!acc[id]) acc[id] = { view_count: 0, click_count: 0 };
        if (event.event_type === 'impression' || event.event_type === 'view') acc[id].view_count++;
        else if (event.event_type === 'click') acc[id].click_count++;
        return acc;
    }, {});
};

const createPromotionBulkOps = (updates: Record<string, any>) => {
    return Object.entries(updates).map(([id, counts]: [string, any]) => ({
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
};

const createOfferBulkOps = (updates: Record<string, any>) => {
    return Object.entries(updates).map(([id, counts]: [string, any]) => ({
        updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(id) },
            update: {
                $inc: {
                    view_count: counts.view_count,
                    click_count: counts.click_count
                }
            }
        }
    }));
};

export const processAnalyticsBatch = async (req: Request, res: Response) => {
    try {
        const { events, metadata } = req.body;
        console.log(`[AnalyticsBatch] Received ${events?.length || 0} events. Metadata:`, metadata);

        if (!Array.isArray(events) || events.length === 0) {
            return sendSuccess(res, { processed: 0 });
        }

        const foodItemEvents: any[] = [];
        const outletEvents: any[] = [];
        const promotionEvents: any[] = [];
        const offerEvents: any[] = [];

        for (const event of events) {
            const { type, timestamp, payload } = event;
            const baseData = createBaseEventData(metadata, payload, timestamp, req);

            if (isItemEvent(type)) {
                const itemEvent = createFoodItemEvent(baseData, payload, type);
                if (itemEvent) foodItemEvents.push(itemEvent);
            } else if (isOutletEvent(type)) {
                const outletEvent = createOutletEvent(baseData, payload, type);
                if (outletEvent) outletEvents.push(outletEvent);
            } else if (isPromoEvent(type)) {
                const promoEvent = createPromoEvent(baseData, payload, type);
                if (promoEvent) promotionEvents.push(promoEvent);
            } else if (isOfferEvent(type)) {
                const offerEvent = createOfferEvent(baseData, payload, type);
                if (offerEvent) offerEvents.push(offerEvent);
            }
        }

        // Bulk Write Operations
        const promises: Promise<any>[] = [];

        if (foodItemEvents.length > 0) {
            promises.push(FoodItemAnalyticsEvent.insertMany(foodItemEvents, { ordered: false }));
        }

        if (outletEvents.length > 0) {
            promises.push(OutletAnalyticsEvent.insertMany(outletEvents, { ordered: false }));
        }

        if (promotionEvents.length > 0) {
            console.log(`[AnalyticsBatch] Attempting to insert ${promotionEvents.length} promotion events`);
            promises.push(PromotionEvent.insertMany(promotionEvents, { ordered: false }));

            const promotionUpdates = aggregatePromotionUpdates(promotionEvents);
            const bulkOps = createPromotionBulkOps(promotionUpdates);

            if (bulkOps.length > 0) {
                promises.push(FeaturedPromotion.bulkWrite(bulkOps));
            }
        }

        if (offerEvents.length > 0) {
            console.log(`[AnalyticsBatch] Attempting to insert ${offerEvents.length} offer events`);
            promises.push(OfferEvent.insertMany(offerEvents, { ordered: false }));

            const offerUpdates = aggregateOfferUpdates(offerEvents);
            const offerBulkOps = createOfferBulkOps(offerUpdates);

            if (offerBulkOps.length > 0) {
                promises.push(Offer.bulkWrite(offerBulkOps as any));
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

        console.log(`[AnalyticsBatch] Processed: food=${foodItemEvents.length}, outlet=${outletEvents.length}, promo=${promotionEvents.length}, offers=${offerEvents.length}`);

        return sendSuccess(res, {
            processed: events.length,
            food_items: foodItemEvents.length,
            outlets: outletEvents.length,
            promotions: promotionEvents.length,
            offers: offerEvents.length
        });
    } catch (error: any) {
        console.error('Process analytics batch error:', error);
        return sendError(res, error.message || 'Failed to process analytics batch');
    }
};
