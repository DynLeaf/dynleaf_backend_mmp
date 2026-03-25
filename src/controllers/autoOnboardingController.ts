import { Request, Response } from 'express';
import * as autoOnboardingService from '../services/autoOnboardingService.js';

const KERALA_CITIES = [
    'Thiruvananthapuram', 'Kollam', 'Pathanamthitta', 'Alappuzha',
    'Kottayam', 'Idukki', 'Ernakulam', 'Thrissur', 'Palakkad',
    'Malappuram', 'Kozhikode', 'Wayanad', 'Kannur', 'Kasaragod'
];

interface AuthRequest extends Request {
    user?: any;
}

/**
 * Get list of onboarded restaurants (for filtering)
 * Returns place_ids of restaurants already in the system
 */
export const getOnboardedPlaceIds = async (req: AuthRequest, res: Response) => {
    try {
        const { city } = req.query;
        const onboarded = await autoOnboardingService.getOnboardedOutlets(city as string);

        res.json({
            onboarded,
            cities: KERALA_CITIES
        });
    } catch (error: any) {
        console.error('Error fetching onboarded restaurants:', error);
        res.status(500).json({ error: 'Failed to fetch onboarded restaurants' });
    }
};

/**
 * Check if a restaurant is already onboarded
 * Checks by name and approximate location
 */
export const checkIfOnboarded = async (req: AuthRequest, res: Response) => {
    try {
        const { name, latitude, longitude, address } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Restaurant name is required' });
        }

        const result = await autoOnboardingService.checkIsOnboarded(name, latitude, longitude);
        res.json(result);
    } catch (error: any) {
        console.error('Error checking onboarding status:', error);
        res.status(500).json({ error: 'Failed to check onboarding status' });
    }
};

/**
 * Get Kerala cities list
 */
export const getKeralaCities = async (req: Request, res: Response) => {
    try {
        res.json({ cities: KERALA_CITIES });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch cities' });
    }
};
