import express from 'express';
import { authenticate, requireOutletAccess } from '../middleware/authMiddleware.js';
import { requireSubscriptionFeature, checkFeatureLimit } from '../middleware/subscriptionMiddleware.js';
import * as offerController from '../controllers/offerController.js';
import * as subscriptionController from '../controllers/subscriptionController.js';
import { SUBSCRIPTION_FEATURES } from '../config/subscriptionPlans.js';

const router = express.Router();

// Get my subscription info (owner-facing)
router.get(
    '/:outletId/my-subscription',
    authenticate,
    requireOutletAccess,
    subscriptionController.getMySubscription
);

// Create offer - requires premium subscription with offer_management feature
router.post(
    '/:outletId/offers',
    authenticate,
    requireOutletAccess,
    requireSubscriptionFeature(SUBSCRIPTION_FEATURES.OFFER_MANAGEMENT),
    checkFeatureLimit('offers'),
    offerController.createOffer
);

// Get outlet offers - read-only, no subscription required
router.get(
    '/:outletId/offers',
    authenticate,
    requireOutletAccess,
    offerController.getOutletOffers
);

// Get single offer - read-only, no subscription required
router.get(
    '/:outletId/offers/:offerId',
    authenticate,
    requireOutletAccess,
    offerController.getOfferById
);

// Update offer - requires subscription
router.patch(
    '/:outletId/offers/:offerId',
    authenticate,
    requireOutletAccess,
    requireSubscriptionFeature(SUBSCRIPTION_FEATURES.OFFER_MANAGEMENT),
    offerController.updateOffer
);

// Delete offer - requires subscription
router.delete(
    '/:outletId/offers/:offerId',
    authenticate,
    requireOutletAccess,
    requireSubscriptionFeature(SUBSCRIPTION_FEATURES.OFFER_MANAGEMENT),
    offerController.deleteOffer
);

// Toggle offer status - requires subscription
router.patch(
    '/:outletId/offers/:offerId/toggle',
    authenticate,
    requireOutletAccess,
    requireSubscriptionFeature(SUBSCRIPTION_FEATURES.OFFER_MANAGEMENT),
    offerController.toggleOfferStatus
);

export default router;
