import express from 'express';
import {
    listSubMenus,
    createSubMenu,
    updateSubMenu,
    deleteSubMenu,
    updateSubMenuCategories,
    reorderSubMenus,
    updateMultiMenuSettings
} from '../controllers/outletSubMenuController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Sub-Menu Routes
 * Base prefix registered as: /api/v1/outlets (see app.ts)
 * Full paths:
 *   GET    /api/v1/outlets/:outletId/sub-menus
 *   POST   /api/v1/outlets/:outletId/sub-menus
 *   PUT    /api/v1/outlets/:outletId/sub-menus/reorder
 *   PUT    /api/v1/outlets/:outletId/sub-menus/:subMenuId
 *   DELETE /api/v1/outlets/:outletId/sub-menus/:subMenuId
 *   PUT    /api/v1/outlets/:outletId/sub-menus/:subMenuId/categories
 *   PUT    /api/v1/outlets/:outletId/multi-menu-settings
 */

// IMPORTANT: /reorder must be BEFORE /:subMenuId to avoid route conflict
router.get('/:outletId/sub-menus', protect, listSubMenus);
router.post('/:outletId/sub-menus', protect, createSubMenu);
router.put('/:outletId/sub-menus/reorder', protect, reorderSubMenus);
router.put('/:outletId/sub-menus/:subMenuId', protect, updateSubMenu);
router.delete('/:outletId/sub-menus/:subMenuId', protect, deleteSubMenu);
router.put('/:outletId/sub-menus/:subMenuId/categories', protect, updateSubMenuCategories);

// Multi-menu settings (ask_submenu_on_scan toggle)
router.put('/:outletId/multi-menu-settings', protect, updateMultiMenuSettings);

export default router;
