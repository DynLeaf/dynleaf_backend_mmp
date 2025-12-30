/**
 * Operating Hours Service
 * Handles operations on OperatingHours collection
 */

import { OperatingHours } from '../models/OperatingHours.js';
import {
    convertOnboardingToOperatingHours,
    convertOperatingHoursToSchedule,
    type OperatingHourInput,
    type DaySchedule
} from '../utils/openingHoursValidator.js';

/**
 * Save operating hours from onboarding (simple format)
 * Saves to OperatingHours collection only
 */
export const saveOperatingHoursFromOnboarding = async (
    outletId: string,
    operatingHours: OperatingHourInput[]
): Promise<void> => {
    // Delete old hours and insert new
    await OperatingHours.deleteMany({ outlet_id: outletId });
    const docs = convertOnboardingToOperatingHours(outletId, operatingHours);
    await OperatingHours.insertMany(docs);
};

/**
 * Update operating hours via dedicated endpoint
 * Accepts the format from updateOperatingHours controller
 */
export const updateOperatingHoursFromEndpoint = async (
    outletId: string,
    timezone: string,
    days: Array<{
        dayOfWeek: number;
        open: string;
        close: string;
        isClosed: boolean;
    }>
): Promise<void> => {
    // Delete old hours and insert new
    await OperatingHours.deleteMany({ outlet_id: outletId });
    const hours = days.map((day: any) => ({
        outlet_id: outletId,
        day_of_week: day.dayOfWeek,
        open_time: day.open,
        close_time: day.close,
        is_closed: day.isClosed
    }));
    await OperatingHours.insertMany(hours);
};

/**
 * Get operating hours in DaySchedule format from OperatingHours collection
 */
export const getOperatingHours = async (outletId: string): Promise<DaySchedule[] | null> => {
    const operatingHours = await OperatingHours.find({ outlet_id: outletId }).sort({ day_of_week: 1 });
    
    if (operatingHours.length > 0) {
        return convertOperatingHoursToSchedule(operatingHours);
    }
    
    return null;
};
