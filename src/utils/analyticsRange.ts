export type AnalyticsRange = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export interface AnalyticsWindow {
  range: AnalyticsRange;
  start: Date; // inclusive timestamp
  end: Date; // inclusive timestamp
  prevStart: Date;
  prevEnd: Date;
}

function startOfDayUtc(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDayUtc(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function resolveAnalyticsWindow(params: {
  range?: unknown;
  date_from?: unknown;
  date_to?: unknown;
}): AnalyticsWindow {
  const rawRange = typeof params.range === 'string' ? params.range : '7d';
  const range: AnalyticsRange =
    rawRange === 'today' ||
    rawRange === 'yesterday' ||
    rawRange === '7d' ||
    rawRange === '30d' ||
    rawRange === 'custom'
      ? rawRange
      : '7d';

  const now = new Date();
  const todayStart = startOfDayUtc(now);

  let start: Date;
  let end: Date;

  if (range === 'today') {
    start = todayStart;
    end = endOfDayUtc(now);
  } else if (range === 'yesterday') {
    const y = new Date(todayStart);
    y.setUTCDate(y.getUTCDate() - 1);
    start = y;
    end = endOfDayUtc(y);
  } else if (range === '30d') {
    const s = new Date(todayStart);
    s.setUTCDate(s.getUTCDate() - 29);
    start = s;
    end = endOfDayUtc(now);
  } else if (range === 'custom') {
    const from = parseIsoDate(params.date_from);
    const to = parseIsoDate(params.date_to);

    start = from ? startOfDayUtc(from) : todayStart;
    end = to ? endOfDayUtc(to) : endOfDayUtc(now);

    if (end.getTime() < start.getTime()) {
      // swap if user sent reversed
      const tmp = start;
      start = startOfDayUtc(end);
      end = endOfDayUtc(tmp);
    }
  } else {
    // 7d default
    const s = new Date(todayStart);
    s.setUTCDate(s.getUTCDate() - 6);
    start = s;
    end = endOfDayUtc(now);
  }

  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  return { range, start, end, prevStart, prevEnd };
}
