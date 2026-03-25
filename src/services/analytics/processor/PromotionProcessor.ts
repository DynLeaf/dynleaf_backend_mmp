import mongoose from 'mongoose';
import { ParsedEvent } from '../../analyticsSchemaParser.js';
import * as promotionAnalyticsRepo from '../../../repositories/analytics/promotionAnalyticsRepository.js';
import * as promotionRepo from '../../../repositories/promotionRepository.js';
import { fallbackStorage } from '../../analyticsFallbackStorage.js';

export class PromotionProcessor {
    static async process(event: ParsedEvent): Promise<boolean> {
        try {
            const { payload } = event;

            const promoObjectId = mongoose.Types.ObjectId.isValid(payload.promoId)
                ? new mongoose.Types.ObjectId(payload.promoId)
                : undefined;

            if (!promoObjectId) return true;

            const outletObjectId = payload.outletId && mongoose.Types.ObjectId.isValid(payload.outletId)
                ? new mongoose.Types.ObjectId(payload.outletId)
                : undefined;

            await promotionAnalyticsRepo.createEvent({
                session_id: event.session_id,
                device_type: event.device_type,
                user_agent: payload.user_agent || 'unknown',
                ip_address: event.ip_address,
                timestamp: event.timestamp,
                promotion_id: promoObjectId,
                outlet_id: outletObjectId,
                event_type: event.type.replace('promo_', ''),
            });

            this.updateCounters(promoObjectId, event.type).catch(err => {
                console.error('[PromotionProcessor] Failed to update counters:', err);
            });

            return true;
        } catch (error: any) {
            await fallbackStorage.writeEvent(event, `promo_db_error: ${error.message}`);
            return true;
        }
    }

    private static async updateCounters(promoId: mongoose.Types.ObjectId, eventType: string): Promise<void> {
        try {
            const update: any = {};
            if (eventType === 'promo_impression') update['analytics.impressions'] = 1;
            else if (eventType === 'promo_click') update['analytics.clicks'] = 1;

            if (Object.keys(update).length > 0) {
                await promotionRepo.updateById(promoId.toString(), { $inc: update });
            }
        } catch (error) {
            console.error('[PromotionProcessor] Counter update failed:', error);
        }
    }
}
