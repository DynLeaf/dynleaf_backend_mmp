/**
 * Gemini AI Routes
 * All AI-powered features accessed via REST API
 */

import express from 'express';
import {
  getServiceHealth,
  getDishInsights,
  extractMenuFromImage,
  clearCache,
} from '../controllers/geminiController.js';
import { protect } from '../middleware/authMiddleware.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// ============================================================================
// Rate Limiting Middleware (Additional layer on top of service rate limiting)
// ============================================================================

// Rate limiter for AI endpoints - more restrictive than general API
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
  message: {
    success: false,
    error: 'Too many AI requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// More restrictive rate limiter for expensive menu extraction
const menuExtractionRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 requests per minute per IP
  message: {
    success: false,
    error: 'Too many menu extraction requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/gemini/health
 * Public endpoint to check AI service availability
 */
router.get('/health', getServiceHealth);

/**
 * POST /api/gemini/dish-insights
 * Get AI-generated insights for a dish
 * Requires authentication
 */
router.post(
  '/dish-insights',
  protect,
  aiRateLimiter,
  getDishInsights
);

/**
 * POST /api/gemini/extract-menu
 * Extract menu items from an image
 * Requires authentication
 */
router.post(
  '/extract-menu',
  protect,
  menuExtractionRateLimiter,
  extractMenuFromImage
);

/**
 * POST /api/gemini/clear-cache
 * Clear AI service cache
 * Admin only - add admin middleware when available
 */
router.post(
  '/clear-cache',
  protect,
  // TODO: Add admin middleware: requireAdmin,
  clearCache
);

export default router;
