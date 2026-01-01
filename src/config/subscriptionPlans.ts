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
    ONLINE_ORDERING: 'online_ordering'
} as const;

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
    free: {
        name: 'free',
        displayName: 'Free',
        description: 'Basic features to get started',
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
    basic: {
        name: 'basic',
        displayName: 'Basic',
        description: 'Essential features for small restaurants',
        features: [
            SUBSCRIPTION_FEATURES.BASIC_PROFILE,
            SUBSCRIPTION_FEATURES.MENU_DISPLAY,
            SUBSCRIPTION_FEATURES.OFFER_MANAGEMENT,
            SUBSCRIPTION_FEATURES.BASIC_ANALYTICS,
            SUBSCRIPTION_FEATURES.QR_CUSTOMIZATION
        ],
        limits: {
            offers: 5,
            analytics_days: 30,
            menu_items: 100,
            photo_gallery: 15,
            staff_accounts: 3
        },
        price: {
            monthly: 999,
            yearly: 9999,
            currency: 'INR'
        }
    },
    premium: {
        name: 'premium',
        displayName: 'Premium',
        description: 'Advanced features for growing restaurants',
        features: [
            SUBSCRIPTION_FEATURES.BASIC_PROFILE,
            SUBSCRIPTION_FEATURES.MENU_DISPLAY,
            SUBSCRIPTION_FEATURES.OFFER_MANAGEMENT,
            SUBSCRIPTION_FEATURES.ADVANCED_ANALYTICS,
            SUBSCRIPTION_FEATURES.QR_CUSTOMIZATION,
            SUBSCRIPTION_FEATURES.STAFF_MANAGEMENT,
            SUBSCRIPTION_FEATURES.ADVANCED_REPORTS,
            SUBSCRIPTION_FEATURES.TABLE_RESERVATION,
            SUBSCRIPTION_FEATURES.ONLINE_ORDERING
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
    },
    enterprise: {
        name: 'enterprise',
        displayName: 'Enterprise',
        description: 'All features with unlimited access',
        features: [
            SUBSCRIPTION_FEATURES.BASIC_PROFILE,
            SUBSCRIPTION_FEATURES.MENU_DISPLAY,
            SUBSCRIPTION_FEATURES.OFFER_MANAGEMENT,
            SUBSCRIPTION_FEATURES.ADVANCED_ANALYTICS,
            SUBSCRIPTION_FEATURES.QR_CUSTOMIZATION,
            SUBSCRIPTION_FEATURES.STAFF_MANAGEMENT,
            SUBSCRIPTION_FEATURES.MULTI_OUTLET,
            SUBSCRIPTION_FEATURES.API_ACCESS,
            SUBSCRIPTION_FEATURES.PRIORITY_SUPPORT,
            SUBSCRIPTION_FEATURES.CUSTOM_BRANDING,
            SUBSCRIPTION_FEATURES.ADVANCED_REPORTS,
            SUBSCRIPTION_FEATURES.INVENTORY_MANAGEMENT,
            SUBSCRIPTION_FEATURES.TABLE_RESERVATION,
            SUBSCRIPTION_FEATURES.ONLINE_ORDERING
        ],
        limits: {
            offers: -1,
            analytics_days: 365,
            menu_items: -1,
            photo_gallery: -1,
            staff_accounts: -1
        },
        price: {
            monthly: 9999,
            yearly: 99999,
            currency: 'INR'
        }
    }
};

export const getSubscriptionPlan = (planName: string): SubscriptionPlan | null => {
    return SUBSCRIPTION_PLANS[planName] || null;
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
