import express from 'express';
import { getNearbyOffers } from '../controllers/offerController.js';

const router = express.Router();

/**
 * Offer Search Routes
 * Base: /api/v1/offers
 */

// Get nearby offers (geospatial search)
router.get('/nearby', getNearbyOffers);

export default router;
