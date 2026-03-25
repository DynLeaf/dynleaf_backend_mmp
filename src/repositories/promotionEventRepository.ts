import { PromotionEvent } from '../models/PromotionEvent.js';
import mongoose from 'mongoose';

export const create = async (data: Record<string, unknown>) => {
    const doc = await new PromotionEvent(data).save();
    return doc.toObject();
};

export const findDuplicate = async (
    promotionId: string,
    eventType: string,
    sessionId: string,
    startUtc: Date,
    endUtc: Date
) => {
    return await PromotionEvent.findOne({
        promotion_id: promotionId,
        event_type: eventType,
        session_id: sessionId,
        timestamp: { $gte: startUtc, $lt: endUtc }
    }).select('_id').lean();
};

export const aggregateByDay = async (
    promotionId: string,
    dayStart: Date,
    dayEnd: Date
) => {
    const promotionObjectId = new mongoose.Types.ObjectId(promotionId);
    return await PromotionEvent.aggregate([
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
};
