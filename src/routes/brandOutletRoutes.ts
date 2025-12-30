import express from 'express';
import { getFeaturedBrands, getNearbyOutletsNew, getOutletDetail } from '../controllers/brandOutletController.js';

const router = express.Router();

/**
 * Public routes for brand/outlet discovery
 */

// Get featured brands (deduplicated with nearest outlet)
router.get('/featured', getFeaturedBrands);

// Get nearby outlets (outlet-centric with available items)
router.get('/nearby', getNearbyOutletsNew);

// Get outlet detail with categories
router.get('/:outletId/detail', getOutletDetail);

export default router;
