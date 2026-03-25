import { User } from '../../models/User.js';
import { Outlet } from '../../models/Outlet.js';
import { OutletAnalyticsEvent } from '../../models/OutletAnalyticsEvent.js';
import { FoodItemAnalyticsEvent } from '../../models/FoodItemAnalyticsEvent.js';
import { FeaturedPromotion } from '../../models/FeaturedPromotion.js';
import { Offer } from '../../models/Offer.js';

export const countUsersCreated = async (start: Date, end: Date): Promise<number> => {
    return User.countDocuments({ created_at: { $gte: start, $lte: end } });
};

export const countUsersActive = async (start: Date, end: Date): Promise<number> => {
    return User.countDocuments({ last_active_at: { $gte: start, $lte: end } });
};

export const countTotalOutlets = async (): Promise<number> => {
    return Outlet.countDocuments({});
};

export const countOutletsCreated = async (start: Date, end: Date): Promise<number> => {
    return Outlet.countDocuments({ created_at: { $gte: start, $lte: end } });
};

export const countOutletsByStatus = async (status: string, exclude: boolean = false): Promise<number> => {
    if (exclude) return Outlet.countDocuments({ status: { $ne: status } });
    return Outlet.countDocuments({ status });
};

export const countDiscoveryEvents = async (start: Date, end: Date) => {
    const [qrMenuScans, mallQrScans, searchImpressions, nearbyDiscoveries] = await Promise.all([
        OutletAnalyticsEvent.countDocuments({
            event_type: 'menu_view',
            source: { $in: ['qr', 'QR', 'qrcode', 'qr_code'] },
            timestamp: { $gte: start, $lte: end },
        }),
        OutletAnalyticsEvent.countDocuments({
            event_type: 'qr_scan',
            qr_scan_type: 'mall',
            timestamp: { $gte: start, $lte: end },
        }),
        FoodItemAnalyticsEvent.countDocuments({
            event_type: 'item_impression',
            source: 'search',
            timestamp: { $gte: start, $lte: end },
        }),
        OutletAnalyticsEvent.countDocuments({
            source: { $in: ['nearby', 'map', 'maps'] },
            timestamp: { $gte: start, $lte: end },
        }),
    ]);

    return { qrMenuScans, mallQrScans, searchImpressions, nearbyDiscoveries };
};

export const countActivePromotions = async (): Promise<number> => {
    const now = new Date();
    return FeaturedPromotion.countDocuments({
        is_active: true,
        'scheduling.start_date': { $lte: now },
        'scheduling.end_date': { $gte: now },
    });
};

export const countActiveOffers = async (): Promise<number> => {
    const now = new Date();
    // @ts-ignore - Mongoose type inference fails because Offer lacks an interface
    return Offer.countDocuments({
        is_active: true,
        valid_from: { $lte: now },
        valid_till: { $gte: now },
    });
};
