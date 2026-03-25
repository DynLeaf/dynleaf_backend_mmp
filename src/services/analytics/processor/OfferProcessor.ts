import mongoose from 'mongoose';
import { ParsedEvent } from '../../analyticsSchemaParser.js';
import * as offerAnalyticsRepo from '../../../repositories/analytics/offerAnalyticsRepository.js';
import * as offerRepo from '../../../repositories/offerRepository.js';
import { fallbackStorage } from '../../analyticsFallbackStorage.js';

export class OfferProcessor {
    static async process(event: ParsedEvent): Promise<boolean> {
        try {
            const { payload } = event;

            const offerObjectId = mongoose.Types.ObjectId.isValid(payload.offerId)
                ? new mongoose.Types.ObjectId(payload.offerId)
                : undefined;

            if (!offerObjectId) return true;

            const outletObjectId = payload.outletId && mongoose.Types.ObjectId.isValid(payload.outletId)
                ? new mongoose.Types.ObjectId(payload.outletId)
                : undefined;

            await offerAnalyticsRepo.createEvent({
                session_id: event.session_id,
                device_type: event.device_type,
                user_agent: payload.user_agent || 'unknown',
                ip_address: event.ip_address,
                timestamp: event.timestamp,
                offer_id: offerObjectId,
                outlet_id: outletObjectId,
                event_type: event.type.replace('offer_', ''),
                source: payload.source,
                source_context: payload.source_context,
            });

            this.updateCounters(offerObjectId, event.type).catch(err => {
                console.error('[OfferProcessor] Failed to update counters:', err);
            });

            return true;
        } catch (error: any) {
            await fallbackStorage.writeEvent(event, `offer_db_error: ${error.message}`);
            return true;
        }
    }

    private static async updateCounters(offerId: mongoose.Types.ObjectId, eventType: string): Promise<void> {
        try {
            const update: any = {};
            if (eventType === 'offer_impression' || eventType === 'offer_view') update.view_count = 1;
            else if (eventType === 'offer_click') update.click_count = 1;

            if (Object.keys(update).length > 0) {
                await offerRepo.updateById(offerId.toString(), { $inc: update });
            }
        } catch (error) {
            console.error('[OfferProcessor] Counter update failed:', error);
        }
    }
}
