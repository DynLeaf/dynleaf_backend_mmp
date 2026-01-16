import express from 'express';
import { getSocialMeta } from '../controllers/socialShareController.js';

const router = express.Router();

// Public route for social sharing metadata
router.get('/:outletId', getSocialMeta);

export default router;
