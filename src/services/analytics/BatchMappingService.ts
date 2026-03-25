import mongoose from 'mongoose';
import { Request } from 'express';

export const BATCH_PROCESSING_LIMITS = {
    MAX_EVENTS: 1000,
    MIN_EVENTS: 1,
} as const;

export const EVENT_TYPE_PREFIXES = {
    ITEM: 'item_',
    PROMO: 'promo_',
    OFFER: 'offer_',
} as const;

export const OUTLET_EVENT_TYPES = ['outlet_visit', 'profile_view', 'menu_view'] as const;
export const ITEM_EVENT_TYPES = ['add_to_cart', 'order_created'] as const;

export const detectDeviceType = (userAgentRaw: string): 'mobile' | 'desktop' | 'tablet' => {
    const userAgent = userAgentRaw || '';
    if (/mobile/i.test(userAgent) && !/tablet|ipad/i.test(userAgent)) return 'mobile';
    if (/tablet|ipad/i.test(userAgent)) return 'tablet';
    return 'desktop';
};

export const getIpAddress = (req: Request) =>
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress;

export const toObjectId = (id: string): mongoose.Types.ObjectId | undefined =>
    mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : undefined;

export const isItemEvent = (type: string): boolean =>
    type.startsWith(EVENT_TYPE_PREFIXES.ITEM) || ITEM_EVENT_TYPES.includes(type as any);

export const isOutletEvent = (type: string): boolean =>
    OUTLET_EVENT_TYPES.includes(type as any);

export const isPromoEvent = (type: string): boolean =>
    type.startsWith(EVENT_TYPE_PREFIXES.PROMO);

export const isOfferEvent = (type: string): boolean =>
    type.startsWith(EVENT_TYPE_PREFIXES.OFFER);

export const createBaseEventData = (metadata: any, payload: any, timestamp: string, req: Request) => ({
    session_id: metadata?.session_id || payload?.session_id || 'anonymous',
    device_type: detectDeviceType(metadata?.user_agent || req.headers['user-agent'] || ''),
    user_agent: metadata?.user_agent || req.headers['user-agent'] || '',
    ip_address: getIpAddress(req),
    timestamp: new Date(timestamp),
    source: payload?.source || 'other',
    source_context: payload?.source_context,
});

export const createFoodItemEvent = (baseData: any, payload: any, type: string) => {
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

export const createOutletEvent = (baseData: any, payload: any, type: string) => {
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

export const createPromoEvent = (baseData: any, payload: any, type: string) => {
    const promoObjectId = toObjectId(payload.promoId);
    const outletObjectId = toObjectId(payload.outletId);

    if (!promoObjectId) return null;

    return {
        ...baseData,
        promotion_id: promoObjectId,
        outlet_id: outletObjectId,
        event_type: type.replace(EVENT_TYPE_PREFIXES.PROMO, ''),
    };
};

export const createOfferEvent = (baseData: any, payload: any, type: string) => {
    const offerObjectId = toObjectId(payload.offerId);
    const outletObjectId = toObjectId(payload.outletId);

    if (!offerObjectId) return null;

    return {
        ...baseData,
        offer_id: offerObjectId,
        outlet_id: outletObjectId,
        event_type: type.replace(EVENT_TYPE_PREFIXES.OFFER, ''),
    };
};

export const aggregatePromotionUpdates = (events: any[]) => {
    return events.reduce((acc: any, event: any) => {
        const id = event.promotion_id.toString();
        if (!acc[id]) acc[id] = { impressions: 0, clicks: 0 };
        if (event.event_type === 'impression') acc[id].impressions++;
        else if (event.event_type === 'click') acc[id].clicks++;
        return acc;
    }, {});
};

export const aggregateOfferUpdates = (events: any[]) => {
    return events.reduce((acc: any, event: any) => {
        const id = event.offer_id.toString();
        if (!acc[id]) acc[id] = { view_count: 0, click_count: 0 };
        if (event.event_type === 'impression' || event.event_type === 'view') acc[id].view_count++;
        else if (event.event_type === 'click') acc[id].click_count++;
        return acc;
    }, {});
};

export const createPromotionBulkOps = (updates: Record<string, any>) => {
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

export const createOfferBulkOps = (updates: Record<string, any>) => {
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

export const getTodayDateRange = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    return { start, end };
};
