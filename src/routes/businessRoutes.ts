import express from 'express';
import { protect, requireOutletAccess } from '../middleware/authMiddleware.js';
import { getOutletDashboardAnalytics } from '../controllers/businessAnalyticsController.js';

const router = express.Router();

// Business dashboard analytics (protected; outlet owner/brand owner scope)
router.get('/outlets/:outletId/dashboard-analytics', protect, requireOutletAccess, getOutletDashboardAnalytics);

export default router;
