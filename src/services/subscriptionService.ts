import mongoose from 'mongoose';
import { SubscriptionCoreService } from './subscription/SubscriptionCoreService.js';
import { SubscriptionLifecycleService } from './subscription/SubscriptionLifecycleService.js';
import { SubscriptionManagementService } from './subscription/SubscriptionManagementService.js';
import { SubscriptionQueryService } from './subscription/SubscriptionQueryService.js';
import { SubscriptionViewHelper } from './subscription/SubscriptionViewHelper.js';

export const ensureSubscriptionForOutlet = SubscriptionCoreService.ensureSubscriptionForOutlet;
export const updateSubscriptionStatus = SubscriptionCoreService.updateSubscriptionStatus;

export const assignSubscriptionToOutlet = SubscriptionLifecycleService.assignSubscriptionToOutlet;

export const upgradeSubscriptionPlan = SubscriptionLifecycleService.upgradeSubscriptionPlan;
export const extendSubscription = SubscriptionLifecycleService.extendSubscription;
export const cancelSubscriptionToFree = SubscriptionLifecycleService.cancelSubscriptionToFree;
export const createTrialSubscription = SubscriptionLifecycleService.createTrialSubscription;

export const listSubscriptions = SubscriptionManagementService.listSubscriptions;
export const updateSubscriptionDirect = SubscriptionManagementService.updateSubscriptionDirect;
export const bulkUpdateSubscriptions = SubscriptionManagementService.bulkUpdateSubscriptions;

export const getSubscriptionHistory = SubscriptionQueryService.getSubscriptionHistory;
export const getOutletSubscriptionHistory = SubscriptionQueryService.getOutletSubscriptionHistory;
export const getSubscriptionStats = SubscriptionQueryService.getSubscriptionStats;
export const getExpiringSubscriptions = SubscriptionQueryService.getExpiringSubscriptions;
export const getPendingSubscriptions = SubscriptionQueryService.getPendingSubscriptions;

export const getSubscriptionInfo = SubscriptionViewHelper.getSubscriptionInfo;
export const hasSubscriptionFeature = SubscriptionViewHelper.hasSubscriptionFeature;
