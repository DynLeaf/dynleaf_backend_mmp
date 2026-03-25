import * as promotionRepo from '../repositories/promotionRepository.js';
import * as promotionEventRepo from '../repositories/promotionEventRepository.js';
import { AppError, ErrorCode } from '../errors/AppError.js';

type DeviceType = 'mobile' | 'desktop' | 'tablet';

const detectDeviceType = (userAgent: string): DeviceType => {
    if (/mobile/i.test(userAgent) && !/tablet|ipad/i.test(userAgent)) return 'mobile';
    if (/tablet|ipad/i.test(userAgent)) return 'tablet';
    return 'desktop';
};

export const trackImpression = async (
    promotionId: string,
    sessionId: string | undefined,
    userAgent: string,
    ipAddress: string | undefined
) => {
    const promotion = await promotionRepo.findByIdRaw(promotionId);
    if (!promotion) throw new AppError('Promotion not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const device_type = detectDeviceType(userAgent);
    const sid = sessionId || 'anonymous';

    // Dedupe: only count 1 impression per promotion per session per UTC day
    if (sessionId) {
        const now = new Date();
        const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

        const existing = await promotionEventRepo.findDuplicate(promotionId, 'impression', sid, startUtc, endUtc);
        if (existing) return { tracked: false, deduped: true };
    }

    await promotionEventRepo.create({
        promotion_id: promotion._id,
        outlet_id: promotion.outlet_id,
        event_type: 'impression',
        session_id: sid,
        device_type,
        user_agent: userAgent,
        ip_address: ipAddress,
        timestamp: new Date()
    });

    await promotionRepo.incrementAnalytics(promotionId, 'impressions');
    return { tracked: true };
};

export const trackClick = async (
    promotionId: string,
    sessionId: string | undefined,
    userAgent: string,
    ipAddress: string | undefined
) => {
    const promotion = await promotionRepo.findByIdRaw(promotionId);
    if (!promotion) throw new AppError('Promotion not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const device_type = detectDeviceType(userAgent);

    await promotionEventRepo.create({
        promotion_id: promotion._id,
        outlet_id: promotion.outlet_id,
        event_type: 'click',
        session_id: sessionId || 'anonymous',
        device_type,
        user_agent: userAgent,
        ip_address: ipAddress,
        timestamp: new Date()
    });

    await promotionRepo.incrementAnalytics(promotionId, 'clicks');

    // Update CTR on the legacy analytics field
    const updated = await promotionRepo.findByIdRaw(promotionId);
    if (updated && updated.analytics.impressions > 0) {
        const ctr = (updated.analytics.clicks / updated.analytics.impressions) * 100;
        updated.analytics.conversion_rate = Math.min(ctr, 100);
        await updated.save();
    }

    return { tracked: true };
};
