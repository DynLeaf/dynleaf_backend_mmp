import { SessionAnalytics } from '../../models/SessionAnalytics.js';
import { NavigationEvent } from '../../models/NavigationEvent.js';

export const createSessionEvent = async (data: any) => {
    return await SessionAnalytics.create(data);
};

export const createNavigationEvent = async (data: any) => {
    return await NavigationEvent.create(data);
};
