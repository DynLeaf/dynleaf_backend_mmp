import mongoose from 'mongoose';
import { ParsedEvent } from '../../analyticsSchemaParser.js';
import * as outletAnalyticsEventRepo from '../../../repositories/analytics/outletAnalyticsEventRepository.js';
import { fallbackStorage } from '../../analyticsFallbackStorage.js';

export class OutletProcessor {
    static async process(event: ParsedEvent): Promise<boolean> {
        try {
            const { payload } = event;

            const outletObjectId = mongoose.Types.ObjectId.isValid(payload.outlet_id)
                ? new mongoose.Types.ObjectId(payload.outlet_id)
                : undefined;

            const isMallQrScan = event.type === 'qr_scan' && payload.type === 'mall' && !!payload.mall_key;

            if (!outletObjectId && !isMallQrScan) {
                return true;
            }

            const promotionObjectId = payload.promotion_id && mongoose.Types.ObjectId.isValid(payload.promotion_id)
                ? new mongoose.Types.ObjectId(payload.promotion_id)
                : undefined;

            const eventDoc: any = {
                session_id: event.session_id,
                device_type: event.device_type,
                user_agent: payload.user_agent || 'unknown',
                ip_address: event.ip_address,
                timestamp: event.timestamp,
                source: payload.source || 'other',
                source_context: payload.source_context,
                event_type: event.type,
                entry_page: payload.entry_page,
                prev_path: payload.prev_path,
                promotion_id: promotionObjectId,
                mall_key: payload.mall_key,
                qr_scan_type: payload.type,
            };

            if (outletObjectId) {
                eventDoc.outlet_id = outletObjectId;
            }

            await outletAnalyticsEventRepo.createEvent(eventDoc);
            return true;
        } catch (error: any) {
            await fallbackStorage.writeEvent(event, `outlet_db_error: ${error.message}`);
            return true;
        }
    }
}
