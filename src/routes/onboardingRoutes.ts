import express from 'express';
import {
    submitOnboarding,
    getOnboardingStatus,
    getPendingRequests,
    approveOnboarding,
    rejectOnboarding,
    saveOnboardingStep,
    getOnboardingDraft,
    getOnboardingSessions,
    clearOnboardingDraft
} from '../controllers/onboardingController.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// User onboarding routes
router.post('/submit', protect, submitOnboarding);
router.get('/status', protect, getOnboardingStatus);

// Draft autosave routes
router.patch('/save-step/:stepNum', protect, saveOnboardingStep);
router.get('/draft', protect, getOnboardingDraft);
router.get('/sessions', protect, getOnboardingSessions);
router.delete('/draft/:sessionId', protect, clearOnboardingDraft);
router.delete('/draft', protect, clearOnboardingDraft);

// Admin routes
router.get('/pending', protect, adminOnly, getPendingRequests);
router.post('/:requestId/approve', protect, adminOnly, approveOnboarding);
router.post('/:requestId/reject', protect, adminOnly, rejectOnboarding);

export default router;
