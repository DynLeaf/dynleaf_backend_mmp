import mongoose from 'mongoose';
import { ParsedEvent } from '../../analyticsSchemaParser.js';
import * as sessionAnalyticsRepo from '../../../repositories/analytics/sessionAnalyticsRepository.js';
import { fallbackStorage } from '../../analyticsFallbackStorage.js';

export class SessionProcessor {
    static async process(event: ParsedEvent): Promise<boolean> {
        try {
            const { payload } = event;
            const userObjectId = payload.user_id && mongoose.Types.ObjectId.isValid(payload.user_id)
                ? new mongoose.Types.ObjectId(payload.user_id)
                : undefined;

            if (event.type === 'session_end') {
                await sessionAnalyticsRepo.createSessionEvent({
                    session_id: event.session_id,
                    user_id: userObjectId,
                    session_duration: payload.session_duration || 0,
                    page_time_spent: payload.page_time_spent || 0,
                    interaction_count: payload.interaction_count || 0,
                    device_type: event.device_type,
                    user_agent: payload.user_agent || 'unknown',
                    ip_address: event.ip_address,
                    timestamp: event.timestamp,
                });
                return true;
            }

            if (event.type === 'navigation') {
                await sessionAnalyticsRepo.createNavigationEvent({
                    session_id: event.session_id,
                    user_id: userObjectId,
                    from: payload.from || '',
                    to: payload.to || '',
                    method: payload.method || 'direct',
                    device_type: event.device_type,
                    user_agent: payload.user_agent || 'unknown',
                    ip_address: event.ip_address,
                    timestamp: event.timestamp,
                });
                return true;
            }

            return true;
        } catch (error: any) {
            await fallbackStorage.writeEvent(event, `session_db_error: ${error.message}`);
            return true;
        }
    }
}
