import { Request } from 'express';

export const detectDeviceType = (userAgentRaw: string): 'mobile' | 'desktop' | 'tablet' => {
  const userAgent = userAgentRaw || '';
  if (/mobile/i.test(userAgent) && !/tablet|ipad/i.test(userAgent)) return 'mobile';
  if (/tablet|ipad/i.test(userAgent)) return 'tablet';
  return 'desktop';
};

export const getIpAddress = (req: Request) =>
  (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress;

export const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const startOfNextUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
export const utcDateKey = (d: Date) => d.toISOString().slice(0, 10);

export const parseDateRange = (date_from?: unknown, date_to?: unknown, defaultDays: number = 30) => {
  const fallbackFrom = new Date(Date.now() - defaultDays * 24 * 60 * 60 * 1000);
  const fallbackTo = new Date();
  const rawFrom = typeof date_from === 'string' ? new Date(date_from) : fallbackFrom;
  const rawTo = typeof date_to === 'string' ? new Date(date_to) : fallbackTo;
  const dateFrom = isNaN(rawFrom.getTime()) ? fallbackFrom : rawFrom;
  const dateTo = isNaN(rawTo.getTime()) ? fallbackTo : rawTo;
  const rangeStart = startOfUtcDay(dateFrom);
  const rangeEndExclusive = startOfNextUtcDay(dateTo);
  return { rangeStart, rangeEndExclusive };
};

export const calculatePercentageChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return parseFloat(((current - previous) / previous * 100).toFixed(2));
};

export const pctChange = calculatePercentageChange;

export const pctChangeStatus = (current: number, previous: number) => {
    const val = calculatePercentageChange(current, previous);
    return {
        pct: Math.abs(val),
        isUp: val >= 0,
        label: `${val >= 0 ? '+' : ''}${val}%`
    };
};

export const formatUtcDayKey = (d: Date) => d.toISOString().slice(0, 10);

export const shiftDays = (d: Date, days: number) => {
    const newDate = new Date(d);
    newDate.setUTCDate(newDate.getUTCDate() + days);
    return newDate;
};
