import mongoose from 'mongoose';
import { ParsedEvent } from '../../analyticsSchemaParser.js';
import * as foodItemAnalyticsRepo from '../../../repositories/analytics/foodItemAnalyticsRepository.js';
import { fallbackStorage } from '../../analyticsFallbackStorage.js';

export class FoodItemProcessor {
    static async process(event: ParsedEvent): Promise<boolean> {
        try {
            const { payload } = event;

            const foodItemObjectId = mongoose.Types.ObjectId.isValid(payload.food_item_id)
                ? new mongoose.Types.ObjectId(payload.food_item_id)
                : undefined;

            const outletObjectId = mongoose.Types.ObjectId.isValid(payload.outlet_id)
                ? new mongoose.Types.ObjectId(payload.outlet_id)
                : undefined;

            if (!foodItemObjectId || !outletObjectId) {
                console.warn('[EventProcessor] Invalid IDs for food item event:', {
                    food_item_id: payload.food_item_id,
                    outlet_id: payload.outlet_id,
                    eventType: event.type
                });
                return true;
            }

            await foodItemAnalyticsRepo.createEvent({
                session_id: event.session_id,
                device_type: event.device_type,
                user_agent: payload.user_agent || 'unknown',
                ip_address: event.ip_address,
                timestamp: event.timestamp,
                source: payload.source || 'other',
                source_context: payload.source_context,
                outlet_id: outletObjectId,
                food_item_id: foodItemObjectId,
                event_type: event.type,
            });

            return true;
        } catch (error: any) {
            await fallbackStorage.writeEvent(event, `food_item_db_error: ${error.message}`);
            return true;
        }
    }
}
