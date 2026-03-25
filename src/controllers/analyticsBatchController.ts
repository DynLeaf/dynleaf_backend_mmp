import { Request, Response } from 'express';
import * as analyticsBatchService from '../services/analyticsBatchService.js';
import * as batchMapper from '../services/analytics/BatchMappingService.js';
import { sendSuccess, sendError } from '../utils/response.js';

export const processAnalyticsBatch = async (req: Request, res: Response) => {
    try {
        const { events, metadata } = req.body;

        if (!Array.isArray(events) || events.length === 0) {
            return sendSuccess(res, { processed: 0 });
        }

        const foodItemEvents: any[] = [];
        const outletEvents: any[] = [];
        const promotionEvents: any[] = [];
        const offerEvents: any[] = [];

        for (const event of events) {
            const { type, timestamp, payload } = event;
            const baseData = batchMapper.createBaseEventData(metadata, payload, timestamp, req);

            if (batchMapper.isItemEvent(type)) {
                const itemEvent = batchMapper.createFoodItemEvent(baseData, payload, type);
                if (itemEvent) {
                    if (type === 'item_view') {
                        const { start, end } = batchMapper.getTodayDateRange();
                        const exists = await analyticsBatchService.checkItemViewExistsToday(
                            itemEvent.food_item_id,
                            itemEvent.session_id,
                            start,
                            end
                        );
                        if (exists) continue;
                    }
                    foodItemEvents.push(itemEvent);
                }
            } else if (batchMapper.isOutletEvent(type)) {
                const outletEvent = batchMapper.createOutletEvent(baseData, payload, type);
                if (outletEvent) {
                    if (type === 'menu_view') {
                        const { start, end } = batchMapper.getTodayDateRange();
                        const exists = await analyticsBatchService.checkMenuViewExistsToday(
                            outletEvent.outlet_id,
                            outletEvent.session_id,
                            start,
                            end
                        );
                        if (exists) continue;
                    }
                    outletEvents.push(outletEvent);
                }
            } else if (batchMapper.isPromoEvent(type)) {
                const promoEvent = batchMapper.createPromoEvent(baseData, payload, type);
                if (promoEvent) promotionEvents.push(promoEvent);
            } else if (batchMapper.isOfferEvent(type)) {
                const offerEvent = batchMapper.createOfferEvent(baseData, payload, type);
                if (offerEvent) offerEvents.push(offerEvent);
            }
        }

        const promotionUpdates = batchMapper.aggregatePromotionUpdates(promotionEvents);
        const promotionBulkOps = batchMapper.createPromotionBulkOps(promotionUpdates);
        
        const offerUpdates = batchMapper.aggregateOfferUpdates(offerEvents);
        const offerBulkOps = batchMapper.createOfferBulkOps(offerUpdates);

        await analyticsBatchService.executeBulkOperations(
            foodItemEvents,
            outletEvents,
            promotionEvents,
            offerEvents,
            promotionBulkOps,
            offerBulkOps
        );

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
