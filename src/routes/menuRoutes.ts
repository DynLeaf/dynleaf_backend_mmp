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
    updateMenuStructure
} from '../controllers/menuController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Categories
router.post('/brands/:brandId/categories', protect, createCategory);
router.get('/brands/:brandId/categories', listCategories);
router.patch('/categories/:categoryId', protect, updateCategory);
router.delete('/categories/:categoryId', protect, deleteCategory);

// Food Items
router.post('/brands/:brandId/food-items', protect, createFoodItem);
router.get('/brands/:brandId/food-items', listFoodItems);
router.patch('/food-items/:foodItemId', protect, updateFoodItem);
router.delete('/food-items/:foodItemId', protect, deleteFoodItem);
router.post('/food-items/:foodItemId/duplicate', protect, duplicateFoodItem);
router.post('/food-items/:foodItemId/upload-image', protect, uploadFoodItemImage);

// Bulk Operations
router.patch('/food-items/bulk-update', protect, bulkUpdateFoodItems);
router.post('/food-items/bulk-delete', protect, bulkDeleteFoodItems);

// Variants
router.post('/food-items/:foodItemId/variants', protect, createVariant);
router.patch('/variants/:variantId', protect, updateVariant);

// Menus
router.post('/brands/:brandId/menus', protect, createMenu);
router.get('/brands/:brandId/menus', listMenus);
router.put('/menus/:menuId/structure', protect, updateMenuStructure);

export default router;
