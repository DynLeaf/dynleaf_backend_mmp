import { getSubscriptionPlan } from '../../config/subscriptionPlans.js';
import { normalizePlanKey } from './SubscriptionHelper.js';

export class SubscriptionViewHelper {
    static getSubscriptionInfo(subscription: any) {
        if (!subscription) return { hasSubscription: false, plan: null, status: null, features: [], limits: null, daysRemaining: null };
        
        const isLegacyCancelled = subscription.status === 'cancelled';
        const planKey = isLegacyCancelled ? 'free' : normalizePlanKey(subscription.plan);
        const plan = getSubscriptionPlan(planKey);
        const status = isLegacyCancelled ? 'inactive' : subscription.status;
        let daysRemaining = null;

        if (subscription.end_date) {
            const diffTime = new Date(subscription.end_date).getTime() - new Date().getTime();
            daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        return {
            hasSubscription: true, subscriptionId: subscription._id, plan: planKey, planDetails: plan, status, features: subscription.features, limits: plan?.limits,
            startDate: subscription.start_date, endDate: subscription.end_date, daysRemaining, isExpired: status === 'expired', isTrial: status === 'trial',
            isCancelled: isLegacyCancelled, trialEndsAt: subscription.trial_ends_at, autoRenew: subscription.auto_renew, paymentStatus: subscription.payment_status, notes: subscription.notes
        };
    }

    static hasSubscriptionFeature(subscription: any | null, feature: string): boolean {
        if (!subscription || (subscription.status !== 'active' && subscription.status !== 'trial')) return false;
        return subscription.features.includes(feature);
    }
}
