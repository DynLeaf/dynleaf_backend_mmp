import express from 'express';
import { getSocialMeta } from '../controllers/socialShareController.js';

const router = express.Router();

// Public route for social sharing metadata
router.get('/:outletId', getSocialMeta);

// Also handle direct restaurant URLs for social sharing
// These routes will be mounted at the root level to catch /restaurant/:id
export const restaurantShareRouter = express.Router();

// Restaurant profile share
restaurantShareRouter.get('/restaurant/:outletId', (req, res) => {
    req.query.type = 'profile';
    return getSocialMeta(req, res);
});

// Restaurant menu share
restaurantShareRouter.get('/restaurant/:outletId/menu', (req, res) => {
    req.query.type = 'menu';
    return getSocialMeta(req, res);
});

export default router;
