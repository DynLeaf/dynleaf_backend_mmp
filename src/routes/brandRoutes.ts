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
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public location-based routes
router.get('/nearby', getNearbyBrands);
router.get('/featured', getFeaturedBrands);
router.get('/:brandId', getBrandById);

// Protected routes
router.post('/', protect, createBrand);
router.get('/', protect, searchBrands);
router.get('/my-brands', protect, getUserBrands);
router.put('/:brandId', protect, updateBrand);
router.post('/:brandId/join', protect, joinBrand);
router.post('/:brandId/access-requests', protect, requestAccess);

export default router;
