import express from 'express';
import { authenticate, requireOutletAccess } from '../middleware/authMiddleware.js';
import { requireSubscriptionFeature, checkFeatureLimit } from '../middleware/subscriptionMiddleware.js';
import * as offerController from '../controllers/offerController.js';
import * as subscriptionController from '../controllers/subscriptionController.js';
import { SUBSCRIPTION_FEATURES } from '../config/subscriptionPlans.js';

const router = express.Router();

// Get offer by ID directly (for sharing/direct links) - PUBLIC
router.get(
    '/offers/:offerId',
    offerController.getOfferByIdDirect
);

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

// Get outlet offers - PUBLIC endpoint for menu browsing
router.get(
    '/:outletId/offers',
    offerController.getOutletOffers
);

// Get single offer - PUBLIC endpoint for menu browsing
router.get(
    '/:outletId/offers/:offerId',
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
