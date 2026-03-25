import * as outletRepo from '../repositories/outletRepository.js';

const KERALA_CITIES = [
    'Thiruvananthapuram', 'Kollam', 'Pathanamthitta', 'Alappuzha',
    'Kottayam', 'Idukki', 'Ernakulam', 'Thrissur', 'Palakkad',
    'Malappuram', 'Kozhikode', 'Wayanad', 'Kannur', 'Kasaragod'
];

export const getOnboardedOutlets = async (city?: string) => {
    const query: any = {
        'address.city': city || { $in: KERALA_CITIES }
    };

    const outlets = await outletRepo.find(query).select('name address.full address.city location').lean();

    return outlets.map((outlet: any) => ({
        _id: outlet._id,
        name: outlet.name,
        address: outlet.address?.full,
        city: outlet.address?.city,
        location: outlet.location
    }));
};

export const checkIsOnboarded = async (name: string, latitude?: number, longitude?: number) => {
    const nameMatch = await outletRepo.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    if (nameMatch) {
        return {
            isOnboarded: true,
            outlet: {
                _id: nameMatch._id,
                name: (nameMatch as any).name,
                address: (nameMatch as any).address
            }
        };
    }

    if (latitude && longitude) {
        const nearbyOutlet = await outletRepo.findOne({
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude.toString()), parseFloat(latitude.toString())]
                    },
                    $maxDistance: 100
                }
            }
        });

        if (nearbyOutlet) {
            return {
                isOnboarded: true,
                outlet: {
                    _id: nearbyOutlet._id,
                    name: (nearbyOutlet as any).name,
                    address: (nearbyOutlet as any).address
                }
            };
        }
    }

    return { isOnboarded: false };
};
