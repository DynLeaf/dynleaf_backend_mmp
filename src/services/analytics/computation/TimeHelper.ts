import { TimeRange } from './types.js';

export class TimeHelper {
    static getTimePeriods(timeRange: TimeRange, customStart?: string, customEnd?: string) {
        // IST timezone offset: UTC + 5:30
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

        // Get current time in IST
        const nowUTC = new Date();
        const nowIST = new Date(nowUTC.getTime() + IST_OFFSET_MS);

        let currentStart: Date;
        let currentEnd: Date;
        let previousStart: Date;
        let previousEnd: Date;

        switch (timeRange) {
            case 'today': {
                const todayStartIST = new Date(nowIST);
                todayStartIST.setHours(0, 0, 0, 0);

                currentStart = new Date(todayStartIST.getTime() - IST_OFFSET_MS);
                currentEnd = nowUTC;

                const yesterdayStartIST = new Date(todayStartIST);
                yesterdayStartIST.setDate(yesterdayStartIST.getDate() - 1);

                const yesterdayEndIST = new Date(nowIST);
                yesterdayEndIST.setDate(yesterdayEndIST.getDate() - 1);

                previousStart = new Date(yesterdayStartIST.getTime() - IST_OFFSET_MS);
                previousEnd = new Date(yesterdayEndIST.getTime() - IST_OFFSET_MS);
                break;
            }

            case '7d':
            case '30d':
            case '90d':
            default: {
                const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;

                const currentEndIST = new Date(nowIST);
                const currentStartIST = new Date(nowIST);
                currentStartIST.setDate(currentStartIST.getDate() - days);

                currentStart = new Date(currentStartIST.getTime() - IST_OFFSET_MS);
                currentEnd = new Date(currentEndIST.getTime() - IST_OFFSET_MS);

                const previousEndIST = new Date(currentStartIST);
                const previousStartIST = new Date(currentStartIST);
                previousStartIST.setDate(previousStartIST.getDate() - days);

                previousStart = new Date(previousStartIST.getTime() - IST_OFFSET_MS);
                previousEnd = new Date(previousEndIST.getTime() - IST_OFFSET_MS);
                break;
            }
        }

        return {
            currentPeriod: { start: currentStart, end: currentEnd },
            previousPeriod: { start: previousStart, end: previousEnd },
        };
    }
}
