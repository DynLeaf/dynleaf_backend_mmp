import express from 'express';
import {
  trackFoodItemAddToCart,
  trackFoodItemImpression,
  trackFoodItemOrderCreated,
  trackFoodItemView,
  getFoodItemAnalyticsByBrand,
  getFoodItemAnalyticsByCategory,
  getFoodItemAnalyticsByItem,
  getFoodItemAnalyticsByOutlet,
} from '../controllers/foodItemAnalyticsController.js';

const router = express.Router();

// Public tracking endpoints (frontend uses sendBeacon/fetch keepalive)
router.post('/impression', trackFoodItemImpression);
router.post('/view', trackFoodItemView);
router.post('/add-to-cart', trackFoodItemAddToCart);
router.post('/order-created', trackFoodItemOrderCreated);

router.get('/outlet/:outletId', getFoodItemAnalyticsByOutlet);
router.get('/brand/:brandId', getFoodItemAnalyticsByBrand);
router.get('/category/:categoryId', getFoodItemAnalyticsByCategory);
router.get('/item/:foodItemId', getFoodItemAnalyticsByItem);

export default router;
