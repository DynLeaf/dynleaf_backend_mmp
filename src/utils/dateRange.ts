/**
 * Shared date range parsing utility for analytics
 */
export const parseDateRange = (range?: string, date_from?: string, date_to?: string) => {
    const now = new Date();
    let start: Date, end: Date;

    const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    if (range === 'yesterday') {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
        end = todayMidnight;
    } else if (range === '7d') {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));
        end = todayMidnight;
    } else if (range === '30d') {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30));
        end = todayMidnight;
    } else if (range === 'custom' && date_from && date_to) {
        start = new Date(date_from);
        end = new Date(date_to);
    } else {
        // Default to last 7 days
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));
        end = todayMidnight;
    }

    return { start, end };
};
