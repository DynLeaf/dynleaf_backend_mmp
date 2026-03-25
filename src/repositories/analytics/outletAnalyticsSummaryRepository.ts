import { OutletAnalyticsSummary } from '../../models/OutletAnalyticsSummary.js';

export const aggregateEvents = async (pipeline: any[]) => {
    return await OutletAnalyticsSummary.aggregate(pipeline);
};
