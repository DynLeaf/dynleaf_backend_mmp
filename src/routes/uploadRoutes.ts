import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getCloudinarySignature, getS3Signature } from '../controllers/uploadController.js';
import { uploadViaBackend } from '../controllers/uploadController.js';

const router = express.Router();

// Signed Cloudinary upload support (legacy)
router.post('/cloudinary-signature', protect, getCloudinarySignature);

// Signed S3 upload support (new)
router.post('/s3-signature', protect, getS3Signature);

// Backend proxy upload (for CORS bypass)
router.post('/upload-via-backend', protect, uploadViaBackend);

export default router;

