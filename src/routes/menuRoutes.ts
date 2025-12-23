import express from 'express';
import {
    createCategory,
    listCategories,
    updateCategory,
    createFoodItem,
    listFoodItems,
    updateFoodItem,
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

// Food Items
router.post('/brands/:brandId/food-items', protect, createFoodItem);
router.get('/brands/:brandId/food-items', listFoodItems);
router.patch('/food-items/:foodItemId', protect, updateFoodItem);

// Variants
router.post('/food-items/:foodItemId/variants', protect, createVariant);
router.patch('/variants/:variantId', protect, updateVariant);

// Menus
router.post('/brands/:brandId/menus', protect, createMenu);
router.get('/brands/:brandId/menus', listMenus);
router.put('/menus/:menuId/structure', protect, updateMenuStructure);

export default router;
