import express from 'express';
import {
    createCategory,
    listCategories,
    updateCategory,
    deleteCategory,
    createFoodItem,
    listFoodItems,
    updateFoodItem,
    deleteFoodItem,
    duplicateFoodItem,
    bulkUpdateFoodItems,
    bulkDeleteFoodItems,
    uploadFoodItemImage,
    createVariant,
    updateVariant,
    createMenu,
    listMenus,
    updateMenuStructure,
    createAddOn,
    listAddOns,
    updateAddOn,
    deleteAddOn,
    createCombo,
    listCombos,
    updateCombo,
    deleteCombo,
    getTrendingDishes
} from '../controllers/menuController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/trending-dishes', getTrendingDishes);

// Categories
router.post('/brands/:brandId/categories', protect, createCategory);
router.get('/brands/:brandId/categories', listCategories);
router.patch('/categories/:categoryId', protect, updateCategory);
router.delete('/categories/:categoryId', protect, deleteCategory);

// Food Items
router.post('/brands/:brandId/food-items', protect, createFoodItem);
router.get('/brands/:brandId/food-items', listFoodItems);

// Bulk Operations (MUST be before parameterized routes)
router.patch('/food-items/bulk-update', protect, bulkUpdateFoodItems);
router.post('/food-items/bulk-delete', protect, bulkDeleteFoodItems);

// Individual Food Item Operations (parameterized routes come after)
router.patch('/food-items/:foodItemId', protect, updateFoodItem);
router.delete('/food-items/:foodItemId', protect, deleteFoodItem);
router.post('/food-items/:foodItemId/duplicate', protect, duplicateFoodItem);
router.post('/food-items/:foodItemId/upload-image', protect, uploadFoodItemImage);

// Variants
router.post('/food-items/:foodItemId/variants', protect, createVariant);
router.patch('/variants/:variantId', protect, updateVariant);

// Add-ons
router.post('/brands/:brandId/addons', protect, createAddOn);
router.get('/brands/:brandId/addons', listAddOns);
router.patch('/addons/:addOnId', protect, updateAddOn);
router.delete('/addons/:addOnId', protect, deleteAddOn);

// Combos
router.post('/brands/:brandId/combos', protect, createCombo);
router.get('/brands/:brandId/combos', listCombos);
router.patch('/combos/:comboId', protect, updateCombo);
router.delete('/combos/:comboId', protect, deleteCombo);

// Menus
router.post('/brands/:brandId/menus', protect, createMenu);
router.get('/brands/:brandId/menus', listMenus);
router.put('/menus/:menuId/structure', protect, updateMenuStructure);

export default router;
// trigger restart
