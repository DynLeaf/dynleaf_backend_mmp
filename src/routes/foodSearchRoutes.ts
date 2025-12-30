import express from 'express';
import { getNearbyFood, getTrendingDishesNew } from '../controllers/foodSearchController.js';

const router = express.Router();

/**
 * Food Search Routes (NEW - Using OutletMenuItem)
 * Base: /api/v1/food
 */

// Get nearby food items (geospatial search)
router.get('/nearby', getNearbyFood);

// Get trending dishes near user
router.get('/trending', getTrendingDishesNew);

export default router;
