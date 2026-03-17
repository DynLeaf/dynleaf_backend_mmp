import express from 'express';
import { getUserLocation } from '../controllers/locationController.js';

const router = express.Router();

/**
 * GET /v1/user-location
 * Public endpoint — no authentication required.
 * Returns detected country code from the request IP.
 */
router.get('/user-location', getUserLocation);

export default router;
