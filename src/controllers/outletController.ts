import { Request, Response } from 'express';
import { Outlet } from '../models/Outlet.js';
import { Brand } from '../models/Brand.js';
import { Compliance } from '../models/Compliance.js';
import { OperatingHours } from '../models/OperatingHours.js';
import { User } from '../models/User.js';
import { sendSuccess, sendError } from '../utils/response.js';

interface AuthRequest extends Request {
    user?: any;
}

export const createOutlet = async (req: AuthRequest, res: Response) => {
    try {
        const { brandId, address, location, name, type, vendorTypes, restaurantType, seatingCapacity, tableCount } = req.body;

        const slug = name.toLowerCase().replace(/ /g, '-') + '-' + Math.random().toString(36).substring(2, 7);

        const outlet = await Outlet.create({
            brand_id: brandId,
            created_by_user_id: req.user._id,
            name,
            slug,
            address,
            location,
            vendor_types: vendorTypes,
            restaurant_type: restaurantType,
            seating_capacity: seatingCapacity,
            table_count: tableCount,
            status: 'DRAFT'
        });

        await User.findByIdAndUpdate(req.user._id, { currentStep: 'COMPLIANCE' });

        return sendSuccess(res, { id: outlet._id, brandId: outlet.brand_id }, null, 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const saveCompliance = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { fssaiNumber, gstNumber, gstPercentage } = req.body;

        await Compliance.findOneAndUpdate(
            { outlet_id: outletId },
            { fssai_number: fssaiNumber, gst_number: gstNumber, gst_percentage: gstPercentage },
            { new: true, upsert: true }
        );

        return sendSuccess(res, null, 'Compliance saved');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const updateOperatingHours = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { timezone, days } = req.body;

        await Outlet.findByIdAndUpdate(outletId, { timezone });

        // Delete old hours and insert new
        await OperatingHours.deleteMany({ outlet_id: outletId });
        const hours = days.map((day: any) => ({
            outlet_id: outletId,
            day_of_week: day.dayOfWeek,
            open_time: day.open,
            close_time: day.close,
            is_closed: day.isClosed
        }));
        await OperatingHours.insertMany(hours);

        return sendSuccess(res, null, 'Operating hours updated');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getProfileOverview = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const outlet = await Outlet.findById(outletId).populate('brand_id');
        if (!outlet) return sendError(res, 'Outlet not found', null, 404);

        const brand: any = outlet.brand_id;

        return sendSuccess(res, {
            outletId: outlet._id,
            name: outlet.name,
            coverImage: outlet.media?.cover_image_url,
            cuisines: brand?.cuisines || [],
            openingStatus: 'OPEN', // Simplified
            distanceKm: null,
            brand: {
                id: brand?._id,
                name: brand?.name,
                logo: brand?.logo_url
            },
            socials: [] // Map from outlet.social_media
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getProfileAbout = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const outlet = await Outlet.findById(outletId);
        if (!outlet) return sendError(res, 'Outlet not found', null, 404);

        const operatingHours = await OperatingHours.find({ outlet_id: outletId });

        return sendSuccess(res, {
            description: '',
            address: outlet.address,
            operatingHours: {
                timezone: outlet.timezone,
                days: operatingHours.map(h => ({
                    dayOfWeek: h.day_of_week,
                    open: h.open_time,
                    close: h.close_time,
                    isClosed: h.is_closed
                }))
            },
            amenities: [],
            otherOutlets: []
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};
