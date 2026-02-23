import express from 'express';
import {
    getFeaturedBrands,
    getNearbyOutletsNew,
    getOutletDetail,
    getNearbyMalls,
    getMallDetail
} from '../controllers/brandOutletController.js';

import { protect, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use((req, res, next) => {
    console.log(`🔍 [Router:brandOutlet] ${req.method} ${req.url} | Params: ${JSON.stringify(req.params)}`);
    next();
});

/**
 * Public routes for brand/outlet discovery
 */

// Get featured brands (deduplicated with nearest outlet)
router.get('/featured', optionalAuth, getFeaturedBrands);

// Get nearby outlets (outlet-centric with available items)
router.get('/nearby', optionalAuth, getNearbyOutletsNew);

// Get nearby malls (derived from food-court/mall addresses)
router.get('/malls/nearby', optionalAuth, getNearbyMalls);

// Get mall detail with all outlets
router.get('/malls/:mallKey', optionalAuth, getMallDetail);

// Get outlet detail with categories
router.get('/:outletId/detail', optionalAuth, getOutletDetail);

export default router;
