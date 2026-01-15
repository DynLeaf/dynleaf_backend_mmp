export interface SubscriptionPlan {
    name: string;
    displayName: string;
    description: string;
    features: string[];
    limits: {
        offers: number;
        analytics_days: number;
        menu_items: number;
        photo_gallery: number;
        staff_accounts: number;
    };
    price?: {
        monthly: number;
        yearly: number;
        currency: string;
    };
}

export type SubscriptionTier = 'free' | 'premium';

// Backward-compatible normalization: legacy plans map to the Premium tier.
export const normalizePlanToTier = (planName?: string | null): SubscriptionTier => {
    if (!planName) return 'free';
    if (planName === 'free') return 'free';
    if (planName === 'premium' || planName === 'basic' || planName === 'enterprise') return 'premium';
    return 'free';
};

export const SUBSCRIPTION_FEATURES = {
    BASIC_PROFILE: 'basic_profile',
    MENU_DISPLAY: 'menu_display',
    OFFER_MANAGEMENT: 'offer_management',
    BASIC_ANALYTICS: 'basic_analytics',
    ADVANCED_ANALYTICS: 'advanced_analytics',
    QR_CUSTOMIZATION: 'qr_customization',
    STAFF_MANAGEMENT: 'staff_management',
    MULTI_OUTLET: 'multi_outlet',
    API_ACCESS: 'api_access',
    PRIORITY_SUPPORT: 'priority_support',
    CUSTOM_BRANDING: 'custom_branding',
    ADVANCED_REPORTS: 'advanced_reports',
    INVENTORY_MANAGEMENT: 'inventory_management',
    TABLE_RESERVATION: 'table_reservation',
    ONLINE_ORDERING: 'online_ordering',
    STORY_PINNING: 'story_pinning'
} as const;

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
    free: {
        name: 'free',
        displayName: 'Free',
        description: 'Core features to get started',
        features: [
            SUBSCRIPTION_FEATURES.BASIC_PROFILE,
            SUBSCRIPTION_FEATURES.MENU_DISPLAY
        ],
        limits: {
            offers: 0,
            analytics_days: 0,
            menu_items: 50,
            photo_gallery: 5,
            staff_accounts: 1
        }
    },
    premium: {
        name: 'premium',
        displayName: 'Premium',
        description: 'Unlock analytics and offers',
        features: [
            SUBSCRIPTION_FEATURES.BASIC_PROFILE,
            SUBSCRIPTION_FEATURES.MENU_DISPLAY,
            SUBSCRIPTION_FEATURES.OFFER_MANAGEMENT,
            SUBSCRIPTION_FEATURES.BASIC_ANALYTICS,
            SUBSCRIPTION_FEATURES.ADVANCED_ANALYTICS,
            SUBSCRIPTION_FEATURES.QR_CUSTOMIZATION,
            SUBSCRIPTION_FEATURES.STAFF_MANAGEMENT,
            SUBSCRIPTION_FEATURES.ADVANCED_REPORTS,
            SUBSCRIPTION_FEATURES.TABLE_RESERVATION,
            SUBSCRIPTION_FEATURES.ONLINE_ORDERING,
            SUBSCRIPTION_FEATURES.STORY_PINNING
        ],
        limits: {
            offers: 20,
            analytics_days: 90,
            menu_items: 500,
            photo_gallery: 50,
            staff_accounts: 10
        },
        price: {
            monthly: 2999,
            yearly: 29999,
            currency: 'INR'
        }
    }
};

export const getSubscriptionPlan = (planName: string): SubscriptionPlan | null => {
    const tier = normalizePlanToTier(planName);
    return SUBSCRIPTION_PLANS[tier] || null;
};

export const hasFeature = (planName: string, feature: string): boolean => {
    const plan = getSubscriptionPlan(planName);
    return plan ? plan.features.includes(feature) : false;
};

export const getFeatureLimit = (planName: string, limitKey: keyof SubscriptionPlan['limits']): number => {
    const plan = getSubscriptionPlan(planName);
    return plan ? plan.limits[limitKey] : 0;
};

export const isUnlimited = (limit: number): boolean => {
    return limit === -1;
};
