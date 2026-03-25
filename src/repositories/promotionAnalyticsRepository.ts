import { PromotionAnalyticsSummary } from '../models/PromotionAnalyticsSummary.js';

export const findByDateRange = async (
    promotionId: string,
    rangeStart: Date,
    rangeEndExclusive: Date
) => {
    return await PromotionAnalyticsSummary.find({
        promotion_id: promotionId,
        date: { $gte: rangeStart, $lt: rangeEndExclusive }
    }).sort({ date: 1 }).lean();
};
