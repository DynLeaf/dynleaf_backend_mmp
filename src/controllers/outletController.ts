import { Request, Response } from 'express';
import { Outlet } from '../models/Outlet.js';
import { Brand } from '../models/Brand.js';
import { Compliance } from '../models/Compliance.js';
import { OperatingHours } from '../models/OperatingHours.js';
import { User } from '../models/User.js';
import { sendSuccess, sendError } from '../utils/response.js';
import * as outletService from '../services/outletService.js';
import { saveBase64Image } from '../utils/fileUpload.js';

interface AuthRequest extends Request {
    user?: any;
}

export const createOutlet = async (req: AuthRequest, res: Response) => {
    try {
        const { 
            brandId, 
            name, 
            address, 
            location, 
            contact,
            coverImage,
            restaurantType, 
            vendorTypes, 
            seatingCapacity, 
            tableCount,
            socialMedia
        } = req.body;

        // Handle cover image upload if base64
        let coverImageUrl = coverImage;
        if (coverImage && coverImage.startsWith('data:')) {
            const uploadResult = await saveBase64Image(coverImage, 'outlets');
            coverImageUrl = uploadResult.url;
        }

        const outlet = await outletService.createOutlet(req.user.id, brandId, {
            name,
            contact,
            address,
            location,
            media: {
                cover_image_url: coverImageUrl
            },
            restaurant_type: restaurantType,
            vendor_types: vendorTypes,
            seating_capacity: seatingCapacity,
            table_count: tableCount,
            social_media: socialMedia
        });

        return sendSuccess(res, { 
            id: outlet._id, 
            brandId: outlet.brand_id,
            name: outlet.name,
            slug: outlet.slug
        }, 'Outlet created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getUserOutlets = async (req: AuthRequest, res: Response) => {
    try {
        const outlets = await outletService.getUserOutlets(req.user.id);
        return sendSuccess(res, { outlets });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const updateOutlet = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const updateData = req.body;

        // Handle cover image upload if base64
        if (updateData.coverImage && updateData.coverImage.startsWith('data:')) {
            const uploadResult = await saveBase64Image(updateData.coverImage, 'outlets');
            updateData.media = { cover_image_url: uploadResult.url };
            delete updateData.coverImage;
        }

        const outlet = await outletService.updateOutlet(outletId, req.user.id, updateData);
        
        if (!outlet) {
            return sendError(res, 'Outlet not found or unauthorized', null, 404);
        }

        return sendSuccess(res, { 
            id: outlet._id, 
            name: outlet.name
        }, 'Outlet updated successfully');
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
