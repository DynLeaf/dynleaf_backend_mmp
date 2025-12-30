import express from 'express';
import {
  getOutletMenu,
  updateOutletMenuItem,
  reorderOutletMenu,
  getOutletMenuCategories,
  toggleMenuItemAvailability
} from '../controllers/outletMenuController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Outlet Menu Management Routes
 * Base: /api/v1/outlets/:outletId/menu
 */

// Public routes
router.get('/:outletId/menu', getOutletMenu);
router.get('/:outletId/menu/categories', getOutletMenuCategories);

// Protected routes (require authentication)
router.patch('/:outletId/menu/:menuItemId', protect, updateOutletMenuItem);
router.patch('/:outletId/menu/:menuItemId/toggle', protect, toggleMenuItemAvailability);
router.post('/:outletId/menu/reorder', protect, reorderOutletMenu);

export default router;
