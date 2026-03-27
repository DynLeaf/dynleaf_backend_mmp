import { Subscription, SubscriptionHistory } from '../models/Subscription.js';
import { Outlet } from '../models/Outlet.js';
import mongoose from 'mongoose';

export const findSubscriptionById = async (id: string, populateOptions?: any[]): Promise<any> => {
    let query = Subscription.findById(id);
    if (populateOptions) {
        populateOptions.forEach(p => query = query.populate(p as any));
    }
    return await query;
};

export const findSubscriptionByOutletId = async (outletId: string): Promise<any> => {
    if (!mongoose.Types.ObjectId.isValid(outletId)) return null;
    return await Subscription.findOne({ outlet_id: outletId }).sort({ updated_at: -1, created_at: -1 }).exec();
};

export const findOutletById = async (id: string) => {
    return await Outlet.findById(id);
};

export const updateOutletSubscriptionId = async (outletId: string, subscriptionId: string | mongoose.Types.ObjectId) => {
    return await Outlet.findByIdAndUpdate(outletId, { subscription_id: subscriptionId });
};

export const createSubscription = async (data: any): Promise<any> => {
    return await Subscription.create(data);
};

export const createSubscriptionHistory = async (data: any) => {
    return await SubscriptionHistory.create(data);
};

export const updateSubscriptionHistoryMetadata = async (subscriptionId: string | mongoose.Types.ObjectId, action: string, metadata: any) => {
    return await SubscriptionHistory.updateOne({ subscription_id: subscriptionId, action }, { $set: { metadata } });
};

export const findSubscriptionsList = async (filter: any, skip: number, limit: number) => {
    return await Subscription.find(filter)
        .populate('outlet_id', 'name slug status')
        .populate('brand_id', 'name')
        .populate('assigned_by', 'username phone')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit);
};

export const countSubscriptions = async (filter: any) => {
    return await Subscription.countDocuments(filter);
};

export const findSubscriptionHistory = async (subscriptionId: string) => {
    return await SubscriptionHistory.find({ subscription_id: subscriptionId })
        .populate('changed_by', 'username phone')
        .sort({ changed_at: -1 });
};

export const findOutletSubscriptionHistory = async (outletId: string) => {
    return await SubscriptionHistory.find({ outlet_id: outletId })
        .populate('changed_by', 'username phone')
        .sort({ changed_at: -1 });
};

export const updateManySubscriptions = async (filter: any, update: any) => {
    return await Subscription.updateMany(filter, update);
};

export const aggregateSubscriptionStats = async () => {
    return await Subscription.aggregate([
        {
            $addFields: {
                plan_tier: {
                    $cond: [
                        { $in: ['$plan', ['premium', 'basic', 'enterprise']] },
                        'premium',
                        'free'
                    ]
                }
            }
        },
        {
            $group: {
                _id: { plan: '$plan_tier', status: '$status' },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.plan': 1, '_id.status': 1 } }
    ]);
};

export const countOutlets = async () => await Outlet.countDocuments();

export const findExpiringSubscriptions = async (futureDate: Date) => {
    return await Subscription.find({
        status: { $in: ['active', 'trial'] },
        $or: [
            { end_date: { $lte: futureDate, $gte: new Date() } },
            { trial_ends_at: { $lte: futureDate, $gte: new Date() } }
        ]
    })
    .populate('outlet_id', 'name slug contact')
    .populate('brand_id', 'name')
    .sort({ end_date: 1, trial_ends_at: 1 });
};

export const findPendingSubscriptions = async (futureDate: Date, limit: number) => {
    const now = new Date();
    return await Subscription.find({
        $or: [
            { payment_status: 'pending' },
            { status: { $in: ['inactive', 'expired', 'trial'] } },
            { status: 'active', end_date: { $lte: futureDate, $gte: now } },
            { status: 'trial', trial_ends_at: { $lte: futureDate, $gte: now } },
        ]
    })
    .populate('outlet_id', 'name slug status subscription_id')
    .populate('brand_id', 'name')
    .populate('assigned_by', 'username phone')
    .sort({ updated_at: -1 })
    .limit(limit);
};

export const findOutletsMissingSubscription = async (limit: number) => {
    return await Outlet.find({
        $or: [
            { subscription_id: { $exists: false } },
            { subscription_id: null },
        ]
    })
    .select('name slug status brand_id created_by_user_id subscription_id')
    .sort({ updated_at: -1 })
    .limit(limit);
};
