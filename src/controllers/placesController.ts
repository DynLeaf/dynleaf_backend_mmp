import type { Request, Response, NextFunction } from 'express';
import axios from 'axios';

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'DynleafMMP/1.0';
const ACCEPT_LANGUAGE = process.env.NOMINATIM_ACCEPT_LANGUAGE || 'en';

type CacheEntry = { expiresAt: number; value: unknown };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;

const getCached = (key: string) => {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return undefined;
    }
    return entry.value;
};

const setCached = (key: string, value: unknown) => {
    // Bound cache growth (best-effort). Map keeps insertion order.
    if (cache.size >= CACHE_MAX_ENTRIES) {
        const deleteCount = Math.min(200, cache.size);
        for (let i = 0; i < deleteCount; i++) {
            const firstKey = cache.keys().next().value;
            if (!firstKey) break;
            cache.delete(firstKey);
        }
    }
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
};

const toNumber = (value: unknown): number | null => {
    const n = typeof value === 'string' ? Number.parseFloat(value) : typeof value === 'number' ? value : NaN;
    if (!Number.isFinite(n)) return null;
    return n;
};

const sanitizeCountryCodes = (value: unknown): string | undefined => {
    if (!value) return undefined;
    const raw = String(value).trim().toLowerCase();
    // Nominatim expects a comma-separated list of ISO3166-1alpha2 codes.
    if (!raw) return undefined;
    if (!/^[a-z]{2}(,[a-z]{2})*$/.test(raw)) return undefined;
    return raw;
};

const formatShortAddress = (address: any, fallbackName?: string): string | undefined => {
    if (!address) return undefined;

    const city =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.county ||
        address.state_district ||
        address.suburb ||
        address.neighbourhood ||
        '';
    const state = address.state || '';
    const country = address.country || '';

    const parts: string[] = [];
    const nameCandidate = (fallbackName || '').trim();
    const cityCandidate = String(city || '').trim();

    // Avoid "Kozhikode, Kozhikode" style duplicates.
    if (cityCandidate && cityCandidate.toLowerCase() !== nameCandidate.toLowerCase()) {
        parts.push(cityCandidate);
    } else if (cityCandidate) {
        parts.push(cityCandidate);
    }

    if (state) parts.push(String(state));
    if (country) parts.push(String(country));

    const joined = parts.filter(Boolean).join(', ');
    return joined || undefined;
};

// Kerala bounding box (approx). Nominatim expects: viewbox=left,top,right,bottom
// left/right are longitudes, top/bottom are latitudes.
const KERALA_VIEWBOX = {
    left: 74.85,
    top: 12.80,
    right: 77.45,
    bottom: 8.15
};

const parseBooleanParam = (value: unknown): boolean | undefined => {
    if (value === undefined || value === null) return undefined;
    const raw = String(value).trim().toLowerCase();
    if (raw === '1' || raw === 'true' || raw === 'yes') return true;
    if (raw === '0' || raw === 'false' || raw === 'no') return false;
    return undefined;
};

type ViewBox = { left: number; top: number; right: number; bottom: number };

const parseViewbox = (value: unknown): ViewBox | null => {
    if (!value) return null;
    const raw = String(value).trim();
    const parts = raw.split(',').map(v => Number.parseFloat(v));
    if (parts.length !== 4) return null;
    const [left, top, right, bottom] = parts;
    if (![left, top, right, bottom].every(Number.isFinite)) return null;
    // sanity: left<right and bottom<top
    if (!(left < right && bottom < top)) return null;
    // global bounds
    if (left < -180 || right > 180 || bottom < -90 || top > 90) return null;
    return { left, top, right, bottom };
};

const clampViewbox = (box: ViewBox, clampTo: ViewBox): ViewBox => {
    return {
        left: Math.max(box.left, clampTo.left),
        right: Math.min(box.right, clampTo.right),
        top: Math.min(box.top, clampTo.top),
        bottom: Math.max(box.bottom, clampTo.bottom)
    };
};

const isValidViewbox = (box: ViewBox): boolean => {
    return box.left < box.right && box.bottom < box.top;
};

export const searchPlaces = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const qRaw = String(req.query.q ?? '').trim();
        if (qRaw.length < 3) {
            return res.status(400).json({ status: false, message: 'Query too short', data: [] });
        }
        if (qRaw.length > 200) {
            return res.status(400).json({ status: false, message: 'Query too long', data: [] });
        }

        const stateFilter = String(req.query.state ?? process.env.PLACES_DEFAULT_STATE ?? '').trim();
        const countrycodesFromQuery = sanitizeCountryCodes(req.query.countrycodes);
        const countrycodesFromEnv = sanitizeCountryCodes(process.env.PLACES_DEFAULT_COUNTRYCODES);
        const countrycodes = countrycodesFromQuery || countrycodesFromEnv;

        const boundedParam = parseBooleanParam(req.query.bounded);
        const stateIsKerala = stateFilter.toLowerCase() === 'kerala';
        const bounded = boundedParam ?? (stateIsKerala ? true : undefined);

        // Optional viewbox hint from client for better local suggestions.
        // If Kerala-only, we clamp it inside Kerala bounds.
        const requestedViewbox = parseViewbox(req.query.viewbox);
        let effectiveViewbox: ViewBox | null = null;
        if (requestedViewbox) {
            effectiveViewbox = stateIsKerala ? clampViewbox(requestedViewbox, KERALA_VIEWBOX) : requestedViewbox;
            if (!isValidViewbox(effectiveViewbox)) {
                effectiveViewbox = null;
            }
        }

        // Default to Kerala bounding box when state=Kerala.
        if (!effectiveViewbox && stateIsKerala) {
            effectiveViewbox = { ...KERALA_VIEWBOX };
        }

        const viewbox = effectiveViewbox
            ? `${effectiveViewbox.left},${effectiveViewbox.top},${effectiveViewbox.right},${effectiveViewbox.bottom}`
            : undefined;

        const cacheKey = `search:${qRaw.toLowerCase()}:${countrycodes || 'any'}:${stateFilter.toLowerCase() || 'any'}:${bounded ?? 'any'}:${viewbox ?? 'any'}`;
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const response = await axios.get(`${NOMINATIM_BASE_URL}/search`, {
            params: {
                format: 'json',
                addressdetails: 1,
                namedetails: 1,
                extratags: 1,
                dedupe: 1,
                limit: 16,
                q: qRaw,
                ...(countrycodes ? { countrycodes } : {})
                ,...(viewbox ? { viewbox } : {})
                ,...(typeof bounded === 'boolean' ? { bounded: bounded ? 1 : 0 } : {})
            },
            timeout: 7000,
            headers: {
                'User-Agent': USER_AGENT,
                'Accept-Language': ACCEPT_LANGUAGE
            }
        });

        const list = Array.isArray(response.data) ? response.data : [];

        const mapped = list
            .map((item: any) => {
                const lat = toNumber(item?.lat);
                const lng = toNumber(item?.lon);
                if (lat == null || lng == null) return null;

                const displayName = String(item?.display_name ?? '').trim();
                const nameFromNamedetails = String(item?.namedetails?.name ?? '').trim();
                const name = nameFromNamedetails || (displayName ? displayName.split(',')[0] : undefined);
                const shortAddress = formatShortAddress(item?.address, name);
                const importance = typeof item?.importance === 'number' ? item.importance : Number(item?.importance ?? 0);
                const rawState = String(item?.address?.state ?? '').trim();

                return {
                    id: String(item?.place_id ?? `${lat},${lng}`),
                    name,
                    // Prefer a stable short address for UI; fall back to display_name.
                    address: shortAddress || displayName || undefined,
                    lat,
                    lng,
                    importance,
                    _state: rawState
                };
            })
            .filter(Boolean)
            // Sort best matches first.
            .sort((a: any, b: any) => (b.importance ?? 0) - (a.importance ?? 0));

        const stateFiltered = stateFilter
            ? (mapped as any[]).filter((item) => String(item?._state ?? '').trim().toLowerCase() === stateFilter.toLowerCase())
            : (mapped as any[]);

        // Dedupe very similar entries. Nominatim often returns multiple records that
        // look identical in UI (same "name" and same formatted address) but have
        // slightly different coordinates.
        //
        // We already sorted by importance, so keep the first occurrence.
        const seen = new Set<string>();
        const deduped: any[] = [];
        for (const item of stateFiltered as any[]) {
            const nameKey = String(item.name ?? '').trim().toLowerCase();
            const addrKey = String(item.address ?? '').trim().toLowerCase();
            const key = `${nameKey}|${addrKey}`;
            if (seen.has(key)) continue;
            seen.add(key);

            // Remove internal field before returning.
            const { importance, _state, ...rest } = item;
            deduped.push(rest);
        }

        const payload = { status: true, data: deduped, message: null, error: null };
        setCached(cacheKey, payload);
        return res.json(payload);
    } catch (error: any) {
        // Don't leak provider/network details to clients.
        console.error('places.search failed:', error?.message || error);
        return res.status(502).json({ status: false, message: 'Place search unavailable', data: [] });
    }
};

export const reversePlace = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const lat = toNumber(req.query.lat);
        const lng = toNumber(req.query.lng);

        if (lat == null || lng == null) {
            return res.status(400).json({ status: false, message: 'lat and lng are required', data: null });
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({ status: false, message: 'lat/lng out of range', data: null });
        }

        const cacheKey = `reverse:${lat.toFixed(6)},${lng.toFixed(6)}`;
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const response = await axios.get(`${NOMINATIM_BASE_URL}/reverse`, {
            params: {
                format: 'json',
                addressdetails: 1,
                zoom: 18,
                lat,
                lon: lng
            },
            timeout: 7000,
            headers: {
                'User-Agent': USER_AGENT,
                'Accept-Language': ACCEPT_LANGUAGE
            }
        });

        // Return raw Nominatim payload inside a standard envelope so frontend can parse consistently.
        const payload = { status: true, data: response.data, message: null, error: null };
        setCached(cacheKey, payload);
        return res.json(payload);
    } catch (error: any) {
        console.error('places.reverse failed:', error?.message || error);
        return res.status(502).json({ status: false, message: 'Reverse geocoding unavailable', data: null });
    }
};
