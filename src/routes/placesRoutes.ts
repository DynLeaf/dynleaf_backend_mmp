import express from 'express';
import rateLimit from 'express-rate-limit';
import { searchPlaces, reversePlace } from '../controllers/placesController.js';

const router = express.Router();

// Public endpoints. Add light rate limiting because these hit an external provider.
const placesLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false
});

router.get('/search', placesLimiter, searchPlaces);
router.get('/reverse', placesLimiter, reversePlace);

export default router;
