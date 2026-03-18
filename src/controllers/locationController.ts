import { Request, Response } from 'express';
import geoip from 'geoip-lite';

/**
 * GET /v1/user-location
 * Detects the user's country from their IP address using geoip-lite.
 * Returns { country: "IN" } for India, { country: "US" } for USA, etc.
 * Falls back to { country: "UNKNOWN" } when IP cannot be resolved.
 *
 * Used by the frontend login page to conditionally show:
 *   - Phone OTP login  → India (IN)
 *   - Google login only → all other countries
 */
export const getUserLocation = (req: Request, res: Response): void => {
    try {
        // Prefer x-forwarded-for (set by proxies/load balancers in production)
        const xForwardedFor = req.headers['x-forwarded-for'];
        let ip: string;

        if (xForwardedFor) {
            // x-forwarded-for can be a comma-separated list; take the first (real client) IP
            ip = (Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor)
                .split(',')[0]
                .trim();
        } else {
            ip = req.ip || '';
        }

        // Strip IPv6-mapped IPv4 prefix (e.g. "::ffff:1.2.3.4" → "1.2.3.4")
        if (ip.startsWith('::ffff:')) {
            ip = ip.slice(7);
        }

        console.log(`🌍 [LOCATION] Detecting country for IP: ${ip}`);

        const geo = geoip.lookup(ip);
        const country = geo?.country || 'UNKNOWN';

        console.log(`🌍 [LOCATION] Resolved country: ${country} for IP: ${ip}`);

        res.json({ country });
    } catch (error: any) {
        console.error('❌ [LOCATION] Country detection failed:', error.message);
        // Fail safe — default to UNKNOWN so frontend shows Google login
        res.json({ country: 'UNKNOWN' });
    }
};
