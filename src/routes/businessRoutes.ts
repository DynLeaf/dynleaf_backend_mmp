import express from 'express';
import { protect, requireOutletAccess } from '../middleware/authMiddleware.js';
import { getOutletDashboardAnalytics } from '../controllers/businessAnalyticsController.js';
import { getOutletSubscription } from '../controllers/businessSubscriptionController.js';
import { updateBrandTheme } from '../controllers/brandController.js';

const router = express.Router();

// Business dashboard analytics (protected; outlet owner/brand owner scope)
router.get('/outlets/:outletId/dashboard-analytics', protect, requireOutletAccess, getOutletDashboardAnalytics);

// Current outlet subscription (protected; outlet owner/brand owner scope)
router.get('/outlets/:outletId/subscription', protect, requireOutletAccess, getOutletSubscription);

// Update brand theme colors (protected; brand owner only)
router.patch('/brands/:brandId/theme', protect, updateBrandTheme);

export default router;
