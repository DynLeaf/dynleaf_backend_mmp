import express from 'express';
import { adminAuth } from '../middleware/adminMiddleware.js';
import * as subscriptionController from '../controllers/subscriptionController.js';

const router = express.Router();

router.post(
    '/outlets/:outletId/subscription',
    adminAuth,
    subscriptionController.assignSubscription
);

router.post(
    '/outlets/:outletId/subscription/trial',
    adminAuth,
    subscriptionController.createTrialSubscription
);

router.get(
    '/subscriptions',
    adminAuth,
    subscriptionController.getAllSubscriptions
);

router.get(
    '/subscriptions/stats',
    adminAuth,
    subscriptionController.getSubscriptionStats
);

router.get(
    '/subscriptions/expiring',
    adminAuth,
    subscriptionController.getExpiringSubscriptions
);

router.get(
    '/subscriptions/:subscriptionId',
    adminAuth,
    subscriptionController.getSubscriptionById
);

router.get(
    '/subscriptions/:subscriptionId/history',
    adminAuth,
    subscriptionController.getSubscriptionHistory
);

router.get(
    '/outlets/:outletId/subscription',
    adminAuth,
    subscriptionController.getOutletSubscription
);

router.get(
    '/outlets/:outletId/subscription/history',
    adminAuth,
    subscriptionController.getOutletSubscriptionHistory
);

router.patch(
    '/subscriptions/:subscriptionId',
    adminAuth,
    subscriptionController.updateSubscription
);

router.patch(
    '/subscriptions/:subscriptionId/extend',
    adminAuth,
    subscriptionController.extendSubscription
);

router.patch(
    '/subscriptions/:subscriptionId/cancel',
    adminAuth,
    subscriptionController.cancelSubscription
);

router.post(
    '/subscriptions/bulk',
    adminAuth,
    subscriptionController.bulkUpdateSubscriptions
);

export default router;
