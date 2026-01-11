import express from 'express';
import {
    createBrand,
    searchBrands,
    joinBrand,
    requestAccess,
    getUserBrands,
    updateBrand,
    getNearbyBrands,
    getFeaturedBrands,
    getBrandById
} from '../controllers/brandController.js';
import { protect, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public location-based routes
router.get('/nearby', getNearbyBrands);
router.get('/featured', getFeaturedBrands);

// Public/Optional auth routes - accessible to everyone, but can use auth if available
router.get('/', optionalAuth, searchBrands);

// Protected routes
router.post('/', protect, createBrand);
router.get('/my-brands', protect, getUserBrands);
router.put('/:brandId', protect, updateBrand);
router.post('/:brandId/join', protect, joinBrand);
router.post('/:brandId/access-requests', protect, requestAccess);

// Public brand profile route (keep after static routes)
router.get('/:brandId', getBrandById);

export default router;
