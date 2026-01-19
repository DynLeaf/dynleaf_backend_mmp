import express from 'express';
import {
    getOnboardedPlaceIds,
    checkIfOnboarded,
    getKeralaCities
} from '../controllers/autoOnboardingController.js';

const router = express.Router();

// Get list of onboarded restaurants
router.get('/onboarded', getOnboardedPlaceIds);

// Check if specific restaurant is onboarded
router.post('/check-onboarded', checkIfOnboarded);

// Get Kerala cities
router.get('/cities', getKeralaCities);

export default router;
