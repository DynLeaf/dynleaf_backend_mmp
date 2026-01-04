import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getCloudinarySignature } from '../controllers/uploadController.js';

const router = express.Router();

// Signed Cloudinary upload support (frontend uploads directly to Cloudinary)
router.post('/cloudinary-signature', protect, getCloudinarySignature);

export default router;
