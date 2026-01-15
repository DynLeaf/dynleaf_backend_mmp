import express from 'express';
import {
  getOutletMenu,
  updateOutletMenuItem,
  reorderOutletMenu,
  getOutletMenuCategories,
  toggleMenuItemAvailability
} from '../controllers/outletMenuController.js';
import { protect, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Outlet Menu Management Routes
 * Base: /api/v1/outlets/:outletId/menu
 */

// Public routes (with optional auth for personalized data like 'is_following')
router.get('/:outletId/menu', optionalAuth, getOutletMenu);
router.get('/:outletId/menu/categories', getOutletMenuCategories);

// Protected routes (require authentication)
router.patch('/:outletId/menu/:menuItemId', protect, updateOutletMenuItem);
router.patch('/:outletId/menu/:menuItemId/toggle', protect, toggleMenuItemAvailability);
router.post('/:outletId/menu/reorder', protect, reorderOutletMenu);

export default router;
