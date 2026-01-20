import { Request, Response } from 'express';
import { Outlet } from '../models/Outlet.js';

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

        const query: any = {
            'address.city': city || { $in: KERALA_CITIES }
        };

        // Get all outlets and extract any Google Place IDs if stored
        // For now, we'll use name + address as identifier
        const outlets = await Outlet.find(query)
            .select('name address.full address.city location')
            .lean();

        // Return list of onboarded restaurants with their identifiers
        const onboarded = outlets.map(outlet => ({
            _id: outlet._id,
            name: outlet.name,
            address: outlet.address?.full,
            city: outlet.address?.city,
            location: outlet.location
        }));

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

        // Check by name (case-insensitive)
        const nameMatch = await Outlet.findOne({
            name: { $regex: new RegExp(`^${name}$`, 'i') }
        });

        if (nameMatch) {
            return res.json({
                isOnboarded: true,
                outlet: {
                    _id: nameMatch._id,
                    name: nameMatch.name,
                    address: nameMatch.address
                }
            });
        }

        // Check by location if provided (within ~100m radius)
        if (latitude && longitude) {
            const nearbyOutlet = await Outlet.findOne({
                location: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [parseFloat(longitude), parseFloat(latitude)]
                        },
                        $maxDistance: 100 // 100 meters
                    }
                }
            });

            if (nearbyOutlet) {
                return res.json({
                    isOnboarded: true,
                    outlet: {
                        _id: nearbyOutlet._id,
                        name: nearbyOutlet.name,
                        address: nearbyOutlet.address
                    }
                });
            }
        }

        res.json({ isOnboarded: false });
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
