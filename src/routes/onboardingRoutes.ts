import express from 'express';
import {
    submitOnboarding,
    getOnboardingStatus,
    getPendingRequests,
    approveOnboarding,
    rejectOnboarding
} from '../controllers/onboardingController.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// User onboarding routes
router.post('/submit', protect, submitOnboarding);
router.get('/status', protect, getOnboardingStatus);

// Admin routes
router.get('/pending', protect, adminOnly, getPendingRequests);
router.post('/:requestId/approve', protect, adminOnly, approveOnboarding);
router.post('/:requestId/reject', protect, adminOnly, rejectOnboarding);

export default router;
