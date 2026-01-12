import { Router } from 'express';
import {
    processAnalyticsBatchBulletproof,
    analyticsHealthCheck,
    retryFallbackEvents
} from '../controllers/analyticsBatchControllerBulletproof.js';

const router = Router();

// Main analytics batch endpoint (BULLETPROOF - NEVER FAILS)
router.post('/batch', processAnalyticsBatchBulletproof);

// Health check endpoint
router.get('/health', analyticsHealthCheck);

// Retry fallback events (admin/cron endpoint)
router.post('/retry-fallback', retryFallbackEvents);

export default router;
