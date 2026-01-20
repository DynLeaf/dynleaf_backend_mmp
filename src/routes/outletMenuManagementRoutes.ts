import express from 'express';
import {
    createCategoryForOutlet,
    listCategoriesForOutlet,
    updateCategoryForOutlet,
    deleteCategoryForOutlet,
    createFoodItemForOutlet,
    listFoodItemsForOutlet,
    updateFoodItemForOutlet,
    deleteFoodItemForOutlet,
    duplicateFoodItemForOutlet,
    bulkUpdateFoodItemsForOutlet,
    bulkDeleteFoodItemsForOutlet,
    uploadFoodItemImageForOutlet,
    createAddOnForOutlet,
    listAddOnsForOutlet,
    updateAddOnForOutlet,
    deleteAddOnForOutlet,
    createComboForOutlet,
    listCombosForOutlet,
    updateComboForOutlet,
    deleteComboForOutlet,
    importMenuForOutlet,
    exportMenuForOutlet,
    getMenuSyncStatusForOutlet,
    previewMenuSyncForOutlet,
    syncMenuToOutlets,
    getMenuSyncHistoryForOutlet
} from '../controllers/outletMenuManagementController.js';
import { protect } from '../middleware/authMiddleware.js';
import { checkBrandSyncPermission } from '../middleware/brandPermissionMiddleware.js';

const router = express.Router();

/**
 * Outlet-Centric Menu Management Routes
 * Base: /api/v1/outlets/:outletId
 */

// Categories
router.post('/:outletId/categories', protect, createCategoryForOutlet);
router.get('/:outletId/categories', listCategoriesForOutlet);
router.patch('/:outletId/categories/:categoryId', protect, updateCategoryForOutlet);
router.delete('/:outletId/categories/:categoryId', protect, deleteCategoryForOutlet);

// Food Items
router.post('/:outletId/food-items', protect, createFoodItemForOutlet);
router.get('/:outletId/food-items', listFoodItemsForOutlet);

// Import/Export (batch)
router.post('/:outletId/menu/import', protect, importMenuForOutlet);
router.get('/:outletId/menu/export', protect, exportMenuForOutlet);
router.get('/:outletId/menu/sync-status', protect, getMenuSyncStatusForOutlet);

// Menu Sync Operations (with brand permission check)
router.post('/:outletId/menu/sync/preview', protect, checkBrandSyncPermission, previewMenuSyncForOutlet);
router.post('/:outletId/menu/sync', protect, checkBrandSyncPermission, syncMenuToOutlets);
router.get('/:outletId/menu/sync-history', protect, getMenuSyncHistoryForOutlet);


// Bulk Operations (MUST be before parameterized routes)
router.patch('/:outletId/food-items/bulk-update', protect, bulkUpdateFoodItemsForOutlet);
router.post('/:outletId/food-items/bulk-delete', protect, bulkDeleteFoodItemsForOutlet);

// Individual Food Item Operations
router.patch('/:outletId/food-items/:foodItemId', protect, updateFoodItemForOutlet);
router.delete('/:outletId/food-items/:foodItemId', protect, deleteFoodItemForOutlet);
router.post('/:outletId/food-items/:foodItemId/duplicate', protect, duplicateFoodItemForOutlet);
router.post('/:outletId/food-items/:foodItemId/upload-image', protect, uploadFoodItemImageForOutlet);

// Add-ons
router.post('/:outletId/addons', protect, createAddOnForOutlet);
router.get('/:outletId/addons', listAddOnsForOutlet);
router.patch('/:outletId/addons/:addOnId', protect, updateAddOnForOutlet);
router.delete('/:outletId/addons/:addOnId', protect, deleteAddOnForOutlet);

// Combos
router.post('/:outletId/combos', protect, createComboForOutlet);
router.get('/:outletId/combos', listCombosForOutlet);
router.patch('/:outletId/combos/:comboId', protect, updateComboForOutlet);
router.delete('/:outletId/combos/:comboId', protect, deleteComboForOutlet);

export default router;
