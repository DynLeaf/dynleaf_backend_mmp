import mongoose from 'mongoose';
import { normalizePlanToTier } from '../../config/subscriptionPlans.js';

export const normalizePlanKey = (plan?: string) => (normalizePlanToTier(plan) === 'premium' ? 'premium' : 'free');

export const toObjectId = (id?: mongoose.Types.ObjectId | string) => {
    if (!id) return undefined;
    if (typeof id !== 'string') return id;
    if (!mongoose.Types.ObjectId.isValid(id)) return undefined;
    return new mongoose.Types.ObjectId(id);
};
