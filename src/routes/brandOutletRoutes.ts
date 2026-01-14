import express from 'express';
import { getFeaturedBrands, getNearbyOutletsNew, getOutletDetail } from '../controllers/brandOutletController.js';

import { protect, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Public routes for brand/outlet discovery
 */

// Get featured brands (deduplicated with nearest outlet)
router.get('/featured', optionalAuth, getFeaturedBrands);

// Get nearby outlets (outlet-centric with available items)
router.get('/nearby', optionalAuth, getNearbyOutletsNew);

// Get outlet detail with categories
router.get('/:outletId/detail', optionalAuth, getOutletDetail);

export default router;
