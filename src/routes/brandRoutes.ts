import express from 'express';
import { createBrand, searchBrands, joinBrand, requestAccess } from '../controllers/brandController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, createBrand);
router.get('/', searchBrands);
router.post('/:brandId/join', protect, joinBrand);
router.post('/:brandId/access-requests', protect, requestAccess);

export default router;
