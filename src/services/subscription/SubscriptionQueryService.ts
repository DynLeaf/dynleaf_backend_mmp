import * as subRepo from '../../repositories/subscriptionRepository.js';
import { normalizePlanKey } from './SubscriptionHelper.js';

export class SubscriptionQueryService {
    static async getSubscriptionHistory(subscriptionId: string) {
        return await subRepo.findSubscriptionHistory(subscriptionId);
    }

    static async getOutletSubscriptionHistory(outletId: string) {
        return await subRepo.findOutletSubscriptionHistory(outletId);
    }

    static async getSubscriptionStats() {
        const stats = await subRepo.aggregateSubscriptionStats();
        const totalOutlets = await subRepo.countOutlets();
        const totalSubscriptions = await subRepo.countSubscriptions({});
        const activeSubscriptions = await subRepo.countSubscriptions({ status: 'active' });
        const expiredSubscriptions = await subRepo.countSubscriptions({ status: 'expired' });
        const trialSubscriptions = await subRepo.countSubscriptions({ status: 'trial' });
        const cancelledSubscriptions = await subRepo.countSubscriptions({ status: 'cancelled' });

        return {
            totalOutlets, totalSubscriptions, outletsWithoutSubscription: totalOutlets - totalSubscriptions,
            activeSubscriptions, expiredSubscriptions, trialSubscriptions, cancelledSubscriptions, breakdown: stats
        };
    }

    static async getExpiringSubscriptions(days: number) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + Number(days));
        const expiringSubscriptions = await subRepo.findExpiringSubscriptions(futureDate);
        return { 
            expiring_subscriptions: expiringSubscriptions.map((s: any) => ({ ...(s.toObject() as any), plan: normalizePlanKey(s.plan) })), 
            count: expiringSubscriptions.length, 
            days: Number(days) 
        };
    }

    static async getPendingSubscriptions(days: number) {
        const lookaheadDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 7;
        const now = new Date();
        const futureDate = new Date(now);
        futureDate.setDate(futureDate.getDate() + lookaheadDays);

        const subscriptions = await subRepo.findPendingSubscriptions(futureDate, 500);

        const items = subscriptions
            .map((s: any) => {
                const reasons: string[] = [];
                const planKey = normalizePlanKey(s.plan);
                const endDate = s.end_date ? new Date(s.end_date) : null;
                const trialEndsAt = s.trial_ends_at ? new Date(s.trial_ends_at) : null;

                if (s.payment_status === 'pending') reasons.push('payment_pending');
                if (s.status === 'expired') reasons.push('expired');
                if (s.status === 'inactive' && planKey !== 'free') reasons.push('inactive_paid_plan');

                if (s.status === 'trial' && trialEndsAt) {
                    if (trialEndsAt <= now) reasons.push('trial_ended');
                    else if (trialEndsAt <= futureDate) reasons.push('trial_ending_soon');
                }

                if (endDate) {
                    if (endDate <= now && (s.status === 'active' || s.status === 'trial')) reasons.push('end_date_passed');
                    else if (endDate <= futureDate && endDate >= now) reasons.push('expiring_soon');
                }

                const uniqueReasons = Array.from(new Set(reasons));
                return {
                    subscription: { ...(s.toObject() as any), plan: planKey },
                    pending_reasons: uniqueReasons,
                    pending_score: uniqueReasons.length,
                };
            })
            .filter((x: any) => x.pending_score > 0)
            .sort((a: any, b: any) => b.pending_score - a.pending_score);

        const counts = items.reduce((acc: any, item: any) => {
            for (const r of item.pending_reasons) acc[r] = (acc[r] ?? 0) + 1;
            return acc;
        }, {});

        const outletsMissingSubscription = await subRepo.findOutletsMissingSubscription(200);

        return { lookahead_days: lookaheadDays, count: items.length, counts, items, outlets_missing_subscription: outletsMissingSubscription };
    }
}
