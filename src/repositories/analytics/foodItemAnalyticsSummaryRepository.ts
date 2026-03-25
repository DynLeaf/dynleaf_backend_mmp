import { FoodItemAnalyticsSummary } from '../../models/FoodItemAnalyticsSummary.js';

export const aggregateEvents = async (pipeline: any[]) => {
    return await FoodItemAnalyticsSummary.aggregate(pipeline);
};
