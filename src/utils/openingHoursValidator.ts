/**
 * Opening Hours Validation and Conversion Utilities
 * Handles validation and conversion between different opening hours formats
 */

export interface TimeSlot {
    open: string;
    close: string;
}

export interface DaySchedule {
    day: string;
    isOpen: boolean;
    slots: TimeSlot[];
}

export interface OperatingHourInput {
    day: string;
    isOpen: boolean;
    slots: TimeSlot[];
}

export interface OperatingHourDoc {
    outlet_id: string;
    day_of_week: number;
    open_time: string;
    close_time: string;
    is_closed: boolean;
}

const DAY_MAP: { [key: string]: number } = {
    'sun': 0, 'sunday': 0,
    'mon': 1, 'monday': 1,
    'tue': 2, 'tuesday': 2,
    'wed': 3, 'wednesday': 3,
    'thu': 4, 'thursday': 4,
    'fri': 5, 'friday': 5,
    'sat': 6, 'saturday': 6
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Validate time format (HH:MM)
 */
export const isValidTimeFormat = (time: string): boolean => {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
};

/**
 * Validate that close time is after open time
 */
export const isValidTimeRange = (openTime: string, closeTime: string): boolean => {
    if (!isValidTimeFormat(openTime) || !isValidTimeFormat(closeTime)) {
        return false;
    }
    
    const [openHour, openMin] = openTime.split(':').map(Number);
    const [closeHour, closeMin] = closeTime.split(':').map(Number);
    
    const openMinutes = openHour * 60 + openMin;
    const closeMinutes = closeHour * 60 + closeMin;
    
    return closeMinutes > openMinutes;
};

/**
 * Get day of week number from day name
 */
export const getDayOfWeek = (day: string): number => {
    const normalized = day.toLowerCase().trim();
    const dayNum = DAY_MAP[normalized];
    
    if (dayNum === undefined) {
        throw new Error(`Invalid day name: ${day}`);
    }
    
    return dayNum;
};

/**
 * Validate opening hours JSON string
 */
export const validateOpeningHoursString = (hoursString: string): { valid: boolean; error?: string } => {
    if (!hoursString || hoursString.trim() === '') {
        return { valid: true }; // Empty is valid (optional field)
    }

    try {
        const parsed = JSON.parse(hoursString);
        
        if (!Array.isArray(parsed)) {
            return { valid: false, error: 'Opening hours must be an array' };
        }

        if (parsed.length !== 7) {
            return { valid: false, error: 'Opening hours must contain exactly 7 days' };
        }

        for (let i = 0; i < parsed.length; i++) {
            const day = parsed[i];
            
            if (!day.day || typeof day.day !== 'string') {
                return { valid: false, error: `Day ${i + 1}: Missing or invalid day name` };
            }

            if (typeof day.isOpen !== 'boolean') {
                return { valid: false, error: `Day ${i + 1}: isOpen must be a boolean` };
            }

            if (day.isOpen) {
                if (!Array.isArray(day.slots) || day.slots.length === 0) {
                    return { valid: false, error: `Day ${i + 1}: Must have at least one time slot when open` };
                }

                for (let j = 0; j < day.slots.length; j++) {
                    const slot = day.slots[j];
                    
                    if (!slot.open || !slot.close) {
                        return { valid: false, error: `Day ${i + 1}, Slot ${j + 1}: Missing open or close time` };
                    }

                    if (!isValidTimeFormat(slot.open)) {
                        return { valid: false, error: `Day ${i + 1}, Slot ${j + 1}: Invalid open time format (use HH:MM)` };
                    }

                    if (!isValidTimeFormat(slot.close)) {
                        return { valid: false, error: `Day ${i + 1}, Slot ${j + 1}: Invalid close time format (use HH:MM)` };
                    }

                    if (!isValidTimeRange(slot.open, slot.close)) {
                        return { valid: false, error: `Day ${i + 1}, Slot ${j + 1}: Close time must be after open time` };
                    }
                }
            }
        }

        return { valid: true };
    } catch (error) {
        return { valid: false, error: 'Invalid JSON format' };
    }
};

/**
 * Convert onboarding format to DaySchedule format (already has slots support)
 */
export const convertOnboardingToSchedule = (onboardingHours: OperatingHourInput[]): DaySchedule[] => {
    return onboardingHours.map(hour => ({
        day: hour.day,
        isOpen: hour.isOpen,
        slots: hour.isOpen ? hour.slots : []
    }));
};

/**
 * Convert DaySchedule format to JSON string for storage
 */
export const convertScheduleToString = (schedule: DaySchedule[]): string => {
    return JSON.stringify(schedule);
};

/**
 * Convert DaySchedule format to OperatingHours documents
 */
export const convertScheduleToOperatingHours = (
    outletId: string,
    schedule: DaySchedule[]
): OperatingHourDoc[] => {
    const docs: OperatingHourDoc[] = [];

    for (const day of schedule) {
        const dayOfWeek = getDayOfWeek(day.day);

        if (!day.isOpen || day.slots.length === 0) {
            docs.push({
                outlet_id: outletId,
                day_of_week: dayOfWeek,
                open_time: '',
                close_time: '',
                is_closed: true
            });
        } else {
            // For multiple slots, we'll store the first slot in OperatingHours
            // (OperatingHours model doesn't support multiple slots per day)
            const firstSlot = day.slots[0];
            docs.push({
                outlet_id: outletId,
                day_of_week: dayOfWeek,
                open_time: firstSlot.open,
                close_time: firstSlot.close,
                is_closed: false
            });
        }
    }

    return docs;
};

/**
 * Convert onboarding format directly to OperatingHours documents
 * Uses first slot from each day (OperatingHours model doesn't support multiple slots)
 */
export const convertOnboardingToOperatingHours = (
    outletId: string,
    onboardingHours: OperatingHourInput[]
): OperatingHourDoc[] => {
    return onboardingHours.map(hour => {
        const firstSlot = hour.isOpen && hour.slots.length > 0 ? hour.slots[0] : null;
        return {
            outlet_id: outletId,
            day_of_week: getDayOfWeek(hour.day),
            open_time: firstSlot ? firstSlot.open : '',
            close_time: firstSlot ? firstSlot.close : '',
            is_closed: !hour.isOpen
        };
    });
};

/**
 * Convert OperatingHours documents to DaySchedule format
 */
export const convertOperatingHoursToSchedule = (operatingHours: any[]): DaySchedule[] => {
    const schedule: DaySchedule[] = [];

    for (let i = 0; i < 7; i++) {
        const dayHours = operatingHours.filter(h => h.day_of_week === i);
        const dayName = DAY_NAMES[i];

        if (dayHours.length === 0 || dayHours[0].is_closed) {
            schedule.push({
                day: dayName,
                isOpen: false,
                slots: []
            });
        } else {
            schedule.push({
                day: dayName,
                isOpen: true,
                slots: dayHours.map(h => ({
                    open: h.open_time,
                    close: h.close_time
                }))
            });
        }
    }

    return schedule;
};

/**
 * Parse opening hours string to DaySchedule format
 */
export const parseOpeningHoursString = (hoursString: string): DaySchedule[] | null => {
    if (!hoursString || hoursString.trim() === '') {
        return null;
    }

    try {
        const parsed = JSON.parse(hoursString);
        if (Array.isArray(parsed) && parsed.length === 7) {
            return parsed as DaySchedule[];
        }
        return null;
    } catch (error) {
        return null;
    }
};
