import mongoose from 'mongoose';
import * as foodItemAnalyticsRepo from '../repositories/analytics/foodItemAnalyticsRepository.js';
import * as outletAnalyticsEventRepo from '../repositories/analytics/outletAnalyticsEventRepository.js';
import * as promotionAnalyticsRepo from '../repositories/analytics/promotionAnalyticsRepository.js';
import * as offerAnalyticsRepo from '../repositories/analytics/offerAnalyticsRepository.js';
import * as promotionRepo from '../repositories/promotionRepository.js';
import * as offerRepo from '../repositories/offerRepository.js';

// Note: Using .js extensions for compatibility with the project's ESM setup

export const checkMenuViewExistsToday = async (
    outletId: mongoose.Types.ObjectId,
    sessionId: string,
    start: Date,
    end: Date
): Promise<boolean> => {
    try {
        const existing = await outletAnalyticsEventRepo.findRecentEvent(
            String(outletId),
            sessionId,
            'menu_view',
            start
        );
        return !!existing;
    } catch (error) {
        console.error('[Analytics] Error checking menu view existence:', error);
        return false;
    }
};

export const checkItemViewExistsToday = async (
    foodItemId: mongoose.Types.ObjectId,
    sessionId: string,
    start: Date,
    end: Date
): Promise<boolean> => {
    try {
        const existing = await foodItemAnalyticsRepo.findRecentEvent({
            food_item_id: foodItemId,
            session_id: sessionId,
            event_type: 'item_view',
            timestamp: { $gte: start, $lte: end }
        });
        return !!existing;
    } catch (error) {
        console.error('[Analytics] Error checking item view existence:', error);
        return false;
    }
};

export const executeBulkOperations = async (
    foodItemEvents: any[],
    outletEvents: any[],
    promotionEvents: any[],
    offerEvents: any[],
    promotionBulkOps: any[],
    offerBulkOps: any[]
) => {
    const promises: Promise<any>[] = [];

    if (foodItemEvents.length > 0) {
        promises.push(foodItemAnalyticsRepo.insertMany(foodItemEvents));
    }

    if (outletEvents.length > 0) {
        promises.push(outletAnalyticsEventRepo.insertMany(outletEvents));
    }

    if (promotionEvents.length > 0) {
        promises.push(promotionAnalyticsRepo.insertMany(promotionEvents));
        if (promotionBulkOps.length > 0) {
            promises.push(promotionRepo.bulkWrite(promotionBulkOps));
        }
    }

    if (offerEvents.length > 0) {
        promises.push(offerAnalyticsRepo.insertMany(offerEvents));
        if (offerBulkOps.length > 0) {
            promises.push(offerRepo.bulkWrite(offerBulkOps));
        }
    }

    return await Promise.allSettled(promises);
};
