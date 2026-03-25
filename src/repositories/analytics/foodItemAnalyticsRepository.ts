import mongoose from 'mongoose';
import { FoodItemAnalyticsEvent } from '../../models/FoodItemAnalyticsEvent.js';
import { FoodItemAnalyticsSummary } from '../../models/FoodItemAnalyticsSummary.js';

export const createEvent = async (eventData: any) => {
    return await FoodItemAnalyticsEvent.create(eventData);
};

export const findRecentEvent = async (filter: any) => {
    return await FoodItemAnalyticsEvent.findOne(filter).select('_id');
};

export const aggregateEvents = async (pipeline: any[]) => {
    return await FoodItemAnalyticsEvent.aggregate(pipeline);
};

export const insertMany = async (events: any[]) => {
    return await FoodItemAnalyticsEvent.insertMany(events, { ordered: false });
};

export const findSummaries = async (filter: any) => {
    return await FoodItemAnalyticsSummary.find(filter).lean();
};
