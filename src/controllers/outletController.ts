import { Request, Response } from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import { Outlet } from '../models/Outlet.js';
import { Brand } from '../models/Brand.js';
import { Compliance } from '../models/Compliance.js';
import { OperatingHours } from '../models/OperatingHours.js';
import { User } from '../models/User.js';
import { Follow } from '../models/Follow.js';
import { sendSuccess, sendError } from '../utils/response.js';
import * as outletService from '../services/outletService.js';
import { saveBase64Image } from '../utils/fileUpload.js';
import { updateOperatingHoursFromEndpoint, getOperatingHours } from '../services/operatingHoursService.js';
import { getOutletSubscriptionSummary } from '../utils/subscriptionSummary.js';
import { validateOptionalHttpUrl } from '../utils/url.js';
import { safeDeleteFromCloudinary, deleteFromCloudinary } from '../services/cloudinaryService.js';

interface AuthRequest extends Request {
    user?: any;
}

// Constants
const VALID_GALLERY_CATEGORIES = ['interior', 'exterior', 'food'] as const;
const MAX_INSTAGRAM_REELS = 8;
const DEFAULT_RADIUS_METERS = 10000;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const DEFAULT_FEATURED_LIMIT = 10;
const FALLBACK_RADIUS_METERS = 50000;
const EARTH_RADIUS_KM = 6371;
const EARTH_RADIUS_METERS = 6371e3;
const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const INSTAGRAM_REEL_REGEX = /^https?:\/\/(www\.)?instagram\.com\/(reel|reels)\/[A-Za-z0-9_-]+\/?(\?.*)?$/;

// Helper functions
const validateGalleryCategory = (category: string): boolean => {
    return VALID_GALLERY_CATEGORIES.includes(category as any);
};

const parseLocationCoordinates = (latitude?: string | number, longitude?: string | number) => {
    if (!latitude || !longitude) return null;
    
    return {
        type: 'Point' as const,
        coordinates: [parseFloat(String(longitude)), parseFloat(String(latitude))]
    };
};

const validateMongoId = (id: string): boolean => {
    return mongoose.Types.ObjectId.isValid(id);
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = EARTH_RADIUS_METERS;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = EARTH_RADIUS_KM;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const handleImageUpload = async (imageInput: string, folder: string, prefix?: string): Promise<string> => {
    if (imageInput.startsWith('data:')) {
        const uploadResult = await saveBase64Image(imageInput, folder as any, prefix);
        return uploadResult.url;
    }
    
    if (imageInput.startsWith('http://') || imageInput.startsWith('https://') || imageInput.startsWith('/uploads/')) {
        return imageInput;
    }
    
    throw new Error('Invalid image URL');
};

const checkOutletAccess = (userRoles: any[], outletId: string, brandId: string | null): boolean => {
    return userRoles.some((r: any) => {
        if (r.role === 'admin') return true;
        if (r.scope === 'outlet' && r.outletId?.toString?.() === outletId) return true;
        if (r.scope === 'brand' && r.brandId && brandId) return r.brandId.toString() === brandId;
        return false;
    });
};

const extractBrandId = (outlet: any): string | null => {
    const brandId = outlet?.brand_id?._id?.toString?.()
        ? outlet.brand_id._id.toString()
        : outlet?.brand_id?.toString?.()
            ? outlet.brand_id.toString()
            : null;
    return brandId;
};

const getPaginationParams = (query: any) => {
    const page = parseInt(query.page as string) || DEFAULT_PAGE;
    const limit = parseInt(query.limit as string) || DEFAULT_LIMIT;
    const skip = (page - 1) * limit;
    
    return { page, limit, skip };
};

const buildActiveOutletQuery = (additionalFilters: any = {}) => {
    return {
        ...additionalFilters,
        $and: [
            {
                $or: [
                    { approval_status: 'APPROVED' },
                    { approval_status: { $exists: false } }
                ]
            },
            {
                $or: [
                    { status: 'ACTIVE' },
                    { status: { $exists: false } }
                ]
            }
        ]
    };
};

const buildActiveBrandMatch = () => {
    return {
        $and: [
            {
                $or: [
                    { 'brand.verification_status': 'approved' },
                    { 'brand.verification_status': 'verified' },
                    { 'brand.verification_status': { $exists: false } }
                ]
            },
            {
                $or: [
                    { 'brand.is_active': true },
                    { 'brand.is_active': { $exists: false } }
                ]
            }
        ]
    };
};

// Mappers
const mapOperatingHoursToResponse = (hours: any[]) => {
    return hours.map(h => ({
        dayOfWeek: h.day_of_week,
        open: h.open_time,
        close: h.close_time,
        isClosed: h.is_closed
    }));
};

const mapBrandToResponse = (brand: any) => {
    if (!brand) return null;
    
    return {
        _id: brand._id,
        name: brand.name,
        slug: brand.slug,
        logo_url: brand.logo_url,
        cuisines: brand.cuisines,
        is_featured: brand.is_featured
    };
};

export const createOutlet = async (req: AuthRequest, res: Response) => {
    try {
        const {
            brandId,
            name,
            address,
            location,
            latitude,
            longitude,
            contact,
            coverImage,
            restaurantType,
            vendorTypes,
            seatingCapacity,
            tableCount,
            socialMedia,
            priceRange,
            isPureVeg,
            deliveryTime
        } = req.body;

        // Validate optional review link if present
        validateOptionalHttpUrl('Google review link', socialMedia?.google_review);

        // Handle cover image upload if base64
        let coverImageUrl = coverImage;
        if (coverImage && coverImage.startsWith('data:')) {
            const uploadResult = await saveBase64Image(coverImage, 'outlets');
            coverImageUrl = uploadResult.url;
        }

        // Prepare location object with GeoJSON format
        const locationData = parseLocationCoordinates(latitude, longitude) || location;

        const outlet = await outletService.createOutlet(req.user.id, brandId, {
            name,
            contact,
            address,
            location: locationData,
            media: {
                cover_image_url: coverImageUrl
            },
            restaurant_type: restaurantType,
            vendor_types: vendorTypes,
            seating_capacity: seatingCapacity,
            table_count: tableCount,
            social_media: socialMedia
        });

        // Update additional fields if provided
        if (priceRange || isPureVeg !== undefined || deliveryTime) {
            await Outlet.findByIdAndUpdate(outlet._id, {
                ...(priceRange && { price_range: priceRange }),
                ...(isPureVeg !== undefined && { is_pure_veg: isPureVeg }),
                ...(deliveryTime && { delivery_time: deliveryTime })
            });
        }

        return sendSuccess(res, {
            id: outlet._id,
            brandId: outlet.brand_id,
            name: outlet.name,
            slug: outlet.slug
        }, 'Outlet created successfully', 201);
    } catch (error: any) {
        const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
        return sendError(res, error.message, error, statusCode);
    }
};

export const getUserOutlets = async (req: AuthRequest, res: Response) => {
    try {
        const outlets = await outletService.getUserOutlets(req.user.id);

        // Fetch all operating hours in a single query (avoiding N+1)
        const outletIds = outlets.map((o: any) => o._id);
        const allOperatingHours = await OperatingHours.find({ 
            outlet_id: { $in: outletIds } 
        }).sort({ day_of_week: 1 }).lean();

        // Group operating hours by outlet_id
        const hoursByOutlet = allOperatingHours.reduce((acc: any, hour: any) => {
            const id = hour.outlet_id.toString();
            if (!acc[id]) acc[id] = [];
            acc[id].push(hour);
            return acc;
        }, {});

        // Map outlets with their operating hours
        const outletsWithHours = outlets.map((outlet: any) => ({
            ...outlet.toObject(),
            operatingHours: mapOperatingHoursToResponse(hoursByOutlet[outlet._id.toString()] || [])
        }));

        return sendSuccess(res, { outlets: outletsWithHours });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getUserOutletsList = async (req: AuthRequest, res: Response) => {
    try {
        const outlets = await outletService.getUserOutletsList(req.user.id);
        return sendSuccess(res, { outlets });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getOutletById = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId: idOrSlug } = req.params;
        const outlet = await outletService.getOutletById(idOrSlug);

        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }

        const actualOutletId = outlet._id.toString();
        const userId = (req as any).user?.id;

        // Parallelize independent queries
        const [operatingHours, userFollow, followersCount] = await Promise.all([
            OperatingHours.find({ outlet_id: actualOutletId }).sort({ day_of_week: 1 }).lean(),
            userId ? Follow.findOne({ user: userId, outlet: actualOutletId }).lean() : Promise.resolve(null),
            Follow.countDocuments({ outlet: actualOutletId })
        ]);

        const userRoles = req.user?.roles || [];
        const outletBrandId = extractBrandId(outlet);
        const hasOutletAccess = checkOutletAccess(userRoles, actualOutletId, outletBrandId);

        const outletPayload: any = {
            ...outlet.toObject(),
            operatingHours: mapOperatingHoursToResponse(operatingHours),
            is_following: !!userFollow,
            followers_count: followersCount
        };

        // Only attach subscription details for authorized outlet/brand/admin users.
        // (This route is used by consumer flows too, so we must not leak subscription info.)
        if (hasOutletAccess) {
            const summary = await getOutletSubscriptionSummary(actualOutletId, {
                assignedByUserId: req.user?.id,
                notes: 'Auto-created on outlet details access'
            });
            outletPayload.subscription = summary.subscription;
            outletPayload.free_tier = summary.free_tier;
            outletPayload.had_paid_plan_before = summary.had_paid_plan_before;
        }

        return sendSuccess(res, {
            outlet: outletPayload
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const updateOutlet = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const updateData = req.body;

        // Validate optional review link if present
        validateOptionalHttpUrl('Google review link', updateData?.social_media?.google_review);

        // Validate delivery platform URLs
        validateOptionalHttpUrl('Swiggy delivery URL', updateData?.swiggyDeliveryUrl);
        validateOptionalHttpUrl('Zomato delivery URL', updateData?.zomatoDeliveryUrl);
        validateOptionalHttpUrl('Reservation URL', updateData?.reservationUrl);

        // Delivery status + ordering details
        if (updateData.deliveryEnabled !== undefined) {
            updateData.flags = { ...(updateData.flags || {}), accepts_online_orders: Boolean(updateData.deliveryEnabled) };
            delete updateData.deliveryEnabled;
        }
        if (updateData.orderPhone !== undefined) {
            updateData.order_phone = updateData.orderPhone;
            delete updateData.orderPhone;
        }
        if (updateData.orderLink !== undefined) {
            updateData.order_link = updateData.orderLink;
            delete updateData.orderLink;
        }

        // Delivery platforms
        if (updateData.swiggyDeliveryUrl !== undefined) {
            updateData.swiggy_delivery_url = updateData.swiggyDeliveryUrl;
            delete updateData.swiggyDeliveryUrl;
        }
        if (updateData.zomatoDeliveryUrl !== undefined) {
            updateData.zomato_delivery_url = updateData.zomatoDeliveryUrl;
            delete updateData.zomatoDeliveryUrl;
        }

        // Reservation booking
        if (updateData.reservationPhone !== undefined) {
            updateData.reservation_phone = updateData.reservationPhone;
            delete updateData.reservationPhone;
        }
        if (updateData.reservationUrl !== undefined) {
            updateData.reservation_url = updateData.reservationUrl;
            delete updateData.reservationUrl;
        }

        // Handle cover image updates
        const coverImageFromBody = typeof updateData.coverImage === 'string' ? updateData.coverImage : undefined;
        const coverImageFromMedia =
            typeof updateData.media?.cover_image_url === 'string' ? updateData.media.cover_image_url : undefined;

        const coverImageInput = coverImageFromMedia ?? coverImageFromBody;
        if (typeof coverImageInput === 'string') {
            let coverImageUrl: string;
            
            try {
                coverImageUrl = coverImageInput === '' ? '' : await handleImageUpload(coverImageInput, 'outlets');
            } catch (error) {
                return sendError(res, 'Invalid cover image URL', 400);
            }

            // Get existing outlet to check for old cover image
            const existingOutlet = await Outlet.findById(outletId);
            const oldCoverImage = existingOutlet?.media?.cover_image_url;

            updateData.media = { ...(updateData.media || {}), cover_image_url: coverImageUrl };
            delete updateData.coverImage;

            // Delete old cover image from Cloudinary if it was updated
            if (oldCoverImage) {
                await safeDeleteFromCloudinary(oldCoverImage, coverImageUrl);
            }
        }

        // Handle operating hours - save to OperatingHours collection
        if (updateData.operatingHours !== undefined) {
            const operatingHours = updateData.operatingHours;
            delete updateData.operatingHours;

            // Save to OperatingHours collection
            await updateOperatingHoursFromEndpoint(outletId, DEFAULT_TIMEZONE, operatingHours);
        }

        // Handle amenities
        if (updateData.amenities !== undefined) {
            updateData.amenities = updateData.amenities;
        }

        // Handle seating capacity and table count
        if (updateData.seatingCapacity !== undefined) {
            updateData.seating_capacity = updateData.seatingCapacity;
            delete updateData.seatingCapacity;
        }
        if (updateData.tableCount !== undefined) {
            updateData.table_count = updateData.tableCount;
            delete updateData.tableCount;
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
        const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
        return sendError(res, error.message, error, statusCode);
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

export const getCompliance = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const compliance = await Compliance.findOne({ outlet_id: outletId }).lean();

        return sendSuccess(res, {
            fssaiNumber: compliance?.fssai_number || '',
            gstNumber: compliance?.gst_number || '',
            gstPercentage: compliance?.gst_percentage || 0,
            isVerified: compliance?.is_verified || false
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const uploadPhotoGallery = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const { category, image, url, photoUrl, imageUrl } = req.body;

        if (!category || !validateGalleryCategory(category)) {
            return sendError(res, 'Invalid category. Must be interior, exterior, or food', null, 400);
        }

        const inputUrl: string | undefined = (typeof url === 'string' ? url : undefined)
            || (typeof photoUrl === 'string' ? photoUrl : undefined)
            || (typeof imageUrl === 'string' ? imageUrl : undefined);

        let finalUrl: string;

        try {
            if (typeof image === 'string' && image.startsWith('data:')) {
                const folderPath = `gallery/${category}` as 'gallery/interior' | 'gallery/exterior' | 'gallery/food';
                finalUrl = await handleImageUpload(image, folderPath, `${category}-${Date.now()}`);
            } else if (inputUrl) {
                finalUrl = await handleImageUpload(inputUrl, `gallery/${category}`);
            } else {
                return sendError(res, 'Invalid image data', null, 400);
            }
        } catch (error) {
            return sendError(res, 'Invalid image data', null, 400);
        }

        // Get current outlet
        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, 404);
        }

        // Initialize photo_gallery if not exists
        if (!outlet.photo_gallery) {
            outlet.photo_gallery = { interior: [], exterior: [], food: [] };
        }

        // Add new photo to the appropriate category
        if (!outlet.photo_gallery[category as 'interior' | 'exterior' | 'food']) {
            outlet.photo_gallery[category as 'interior' | 'exterior' | 'food'] = [];
        }
        outlet.photo_gallery[category as 'interior' | 'exterior' | 'food']!.push(finalUrl);

        await outlet.save();

        return sendSuccess(res, {
            url: finalUrl,
            category
        }, 'Photo uploaded successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const deletePhotoGallery = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const { category, photoUrl } = req.body;

        if (!category || !validateGalleryCategory(category)) {
            return sendError(res, 'Invalid category', null, 400);
        }

        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, 404);
        }

        // Remove photo from the appropriate category
        if (outlet.photo_gallery && outlet.photo_gallery[category as 'interior' | 'exterior' | 'food']) {
            outlet.photo_gallery[category as 'interior' | 'exterior' | 'food'] =
                outlet.photo_gallery[category as 'interior' | 'exterior' | 'food']!.filter(url => url !== photoUrl);
        }

        await outlet.save();

        // Delete photo from Cloudinary
        if (photoUrl) {
            await deleteFromCloudinary(photoUrl);
        }

        return sendSuccess(res, null, 'Photo deleted successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const updateOperatingHours = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { timezone, days } = req.body;

        // Validate days array
        if (!Array.isArray(days) || days.length === 0) {
            return sendError(res, 'Days array is required', 400);
        }

        // Use the service to update and sync both storage locations
        await updateOperatingHoursFromEndpoint(outletId, timezone, days);

        return sendSuccess(res, null, 'Operating hours updated and synced successfully');
    } catch (error: any) {
        console.error('updateOperatingHours error:', error);
        return sendError(res, error.message);
    }
};

export const getProfileOverview = async (req: Request, res: Response) => {
    try {
        const { outletId: idOrSlug } = req.params;
        const outlet = await outletService.getOutletById(idOrSlug);
        if (!outlet) return sendError(res, 'Outlet not found', null, 404);

        const brand: any = outlet.brand_id;

        return sendSuccess(res, {
            outletId: outlet._id,
            name: outlet.name,
            slug: outlet.slug,
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
        const { outletId: idOrSlug } = req.params;
        const outlet = await outletService.getOutletById(idOrSlug);
        if (!outlet) return sendError(res, 'Outlet not found', null, 404);

        const actualOutletId = outlet._id.toString();
        const operatingHours = await OperatingHours.find({ outlet_id: actualOutletId });

        return sendSuccess(res, {
            description: '',
            address: outlet.address,
            operatingHours: {
                timezone: outlet.timezone,
                days: mapOperatingHoursToResponse(operatingHours)
            },
            amenities: [],
            otherOutlets: []
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

// Get all outlets for a brand (public route)
export const getBrandOutlets = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const {
            latitude,
            longitude,
            limit,
            excludeOutletId
        } = req.query;

        // Validate brandId
        if (!validateMongoId(brandId)) {
            return sendError(res, 'Invalid brand ID', null, 400);
        }

        const hasLocation = latitude && longitude;
        const lat = hasLocation ? parseFloat(latitude as string) : null;
        const lng = hasLocation ? parseFloat(longitude as string) : null;
        const limitNum = limit ? parseInt(limit as string) : undefined;

        // Build query for outlets
        const query: any = {
            brand_id: brandId,
            status: 'ACTIVE',
            approval_status: 'APPROVED'
        };

        // Exclude specific outlet if provided
        if (excludeOutletId && validateMongoId(excludeOutletId as string)) {
            query._id = { $ne: new mongoose.Types.ObjectId(excludeOutletId as string) };
        }

        // Fetch outlets
        const outlets = await Outlet.find(query)
            .select('name slug address location contact media restaurant_type vendor_types social_media avg_rating total_reviews')
            .lean();



        // Format outlets and calculate distance if location provided
        let formattedOutlets = outlets.map((outlet: any) => {
            const formatted: any = {
                id: outlet._id,
                name: outlet.name,
                slug: outlet.slug,
                address: {
                    full_address: outlet.address?.full || `${outlet.address?.city || ''}, ${outlet.address?.state || ''}`.trim(),
                    city: outlet.address?.city,
                    state: outlet.address?.state,
                    country: outlet.address?.country,
                    pincode: outlet.address?.pincode
                },
                location: outlet.location,
                contact: outlet.contact,
                coverImage: outlet.media?.cover_image_url,
                restaurant_type: outlet.restaurant_type,
                vendor_types: outlet.vendor_types,
                social_media: outlet.social_media,
                rating: outlet.avg_rating || 0,
                total_reviews: outlet.total_reviews || 0
            };

            // Calculate distance if user location is provided
            if (hasLocation && lat !== null && lng !== null && outlet.location?.coordinates) {
                const [outletLng, outletLat] = outlet.location.coordinates;
                const distance = calculateDistanceKm(lat, lng, outletLat, outletLng);
                formatted.distance = distance.toFixed(1);
                formatted._distanceValue = distance; // For sorting
            }

            return formatted;
        });

        // Sort by distance if location was provided
        if (hasLocation && lat !== null && lng !== null) {
            formattedOutlets.sort((a: any, b: any) => {
                const distA = a._distanceValue || Infinity;
                const distB = b._distanceValue || Infinity;
                return distA - distB;
            });

            // Remove the temporary sorting field
            formattedOutlets = formattedOutlets.map((outlet: any) => {
                const { _distanceValue, ...rest } = outlet;
                return rest;
            });
        }

        const total = formattedOutlets.length;
        const limitedOutlets = limitNum ? formattedOutlets.slice(0, limitNum) : formattedOutlets;

        return sendSuccess(res, {
            outlets: limitedOutlets,
            total: total,
            showing: limitedOutlets.length,
            hasMore: total > limitedOutlets.length
        }, `Found ${total} outlet(s) for this brand`);
    } catch (error: any) {
        console.error('getBrandOutlets error:', error);
        return sendError(res, error.message || 'Failed to fetch brand outlets');
    }
};

// Get nearby outlets based on location with filters (like Zomato/Swiggy)
export const getNearbyOutlets = async (req: Request, res: Response) => {
    try {
        const {
            latitude,
            longitude,
            radius = DEFAULT_RADIUS_METERS,
            page = DEFAULT_PAGE,
            limit = DEFAULT_LIMIT,
            cuisines,
            priceRange,
            minRating,
            sortBy = 'distance',
            isVeg,
            search
        } = req.query;

        if (!latitude || !longitude) {
            return sendError(res, 'Latitude and longitude are required', null, 400);
        }

        const lat = parseFloat(latitude as string);
        const lng = parseFloat(longitude as string);
        const radiusMeters = parseInt(radius as string);
        const { page: pageNum, limit: limitNum, skip } = getPaginationParams(req.query);

        // Build match query for outlets
        const outletMatchQuery: any = buildActiveOutletQuery({
            'location.coordinates': { $exists: true, $ne: [] }
        });

        if (priceRange) {
            outletMatchQuery.price_range = { $in: (priceRange as string).split(',').map(Number) };
        }

        if (minRating) {
            outletMatchQuery.avg_rating = { $gte: parseFloat(minRating as string) };
        }

        if (isVeg === 'true') {
            outletMatchQuery.is_pure_veg = true;
        }

        if (search) {
            outletMatchQuery.$or = [
                { name: { $regex: search, $options: 'i' } },
                { 'address.city': { $regex: search, $options: 'i' } },
                { 'address.state': { $regex: search, $options: 'i' } }
            ];
        }

        // Build aggregation pipeline
        const pipeline: any[] = [
            {
                $geoNear: {
                    near: {
                        type: 'Point',
                        coordinates: [lng, lat] // [longitude, latitude]
                    },
                    distanceField: 'distance',
                    maxDistance: radiusMeters,
                    query: outletMatchQuery,
                    spherical: true
                }
            },
            {
                $lookup: {
                    from: 'brands',
                    localField: 'brand_id',
                    foreignField: '_id',
                    as: 'brand'
                }
            },
            {
                $unwind: '$brand'
            },
            {
                $match: buildActiveBrandMatch()
            }
        ];

        // Check if user follows the outlet (Server-Side Join)
        if ((req as any).user?.id) {
            const userId = new mongoose.Types.ObjectId((req as any).user.id);
            pipeline.push({
                $lookup: {
                    from: 'follows',
                    let: { outletId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$outlet', '$$outletId'] },
                                        { $eq: ['$user', userId] }
                                    ]
                                }
                            }
                        },
                        { $limit: 1 }
                    ],
                    as: 'user_follow'
                }
            });

            pipeline.push({
                $addFields: {
                    is_following: { $gt: [{ $size: '$user_follow' }, 0] }
                }
            });
        }

        // Add cuisine filter if provided
        if (cuisines) {
            const cuisineArray = (cuisines as string).split(',');
            pipeline.push({
                $match: {
                    'brand.cuisines': { $in: cuisineArray }
                }
            });
        }

        // Sort based on preference
        if (sortBy === 'rating') {
            pipeline.push({ $sort: { avg_rating: -1, distance: 1 } });
        } else if (sortBy === 'popularity') {
            pipeline.push({ $sort: { total_reviews: -1, distance: 1 } });
        } else {
            pipeline.push({ $sort: { distance: 1 } });
        }

        // Add pagination
        pipeline.push(
            { $skip: skip },
            { $limit: limitNum }
        );

        // Project final result
        pipeline.push({
            $project: {
                _id: 1,
                name: 1,
                slug: 1,
                address: 1,
                location: 1,
                distance: { $round: ['$distance', 0] },
                avg_rating: 1,
                total_reviews: 1,
                price_range: 1,
                delivery_time: 1,
                is_pure_veg: 1,
                media: 1,
                contact: 1,
                vendor_types: 1,
                restaurant_type: 1,
                order_phone: 1,
                order_link: 1,
                flags: 1,
                social_media: 1,
                is_following: 1, // Include computed field
                brand: {
                    _id: '$brand._id',
                    name: '$brand.name',
                    slug: '$brand.slug',
                    logo_url: '$brand.logo_url',
                    cuisines: '$brand.cuisines',
                    is_featured: '$brand.is_featured'
                }
            }
        });

        const outlets = await Outlet.aggregate(pipeline);

        // Count total for pagination
        const countPipeline = pipeline.slice(0, -3); // Remove skip, limit, project
        countPipeline.push({ $count: 'total' });
        const countResult = await Outlet.aggregate(countPipeline);
        const total = countResult.length > 0 ? countResult[0].total : 0;

        // If no nearby outlets, fall back to state/city search
        if (outlets.length === 0) {
            const fallbackOutlets = await Outlet.find({
                status: 'ACTIVE',
                approval_status: 'APPROVED'
            })
                .populate('brand_id', 'name slug logo_url cuisines is_featured')
                .select('name slug address location avg_rating total_reviews price_range delivery_time is_pure_veg media contact order_phone order_link flags social_media')
                .skip(skip)
                .limit(limitNum)
                .lean();

            const fallbackTotal = await Outlet.countDocuments({
                status: 'ACTIVE',
                approval_status: 'APPROVED'
            });

            return sendSuccess(res, {
                outlets: fallbackOutlets.map((outlet: any) => ({
                    ...outlet,
                    distance: null,
                    brand: outlet.brand_id
                })),
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: fallbackTotal,
                    totalPages: Math.ceil(fallbackTotal / limitNum),
                    hasMore: pageNum * limitNum < fallbackTotal
                },
                message: 'No nearby outlets found. Showing all available outlets.'
            });
        }

        return sendSuccess(res, {
            outlets,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
                hasMore: pageNum * limitNum < total
            }
        });
    } catch (error: any) {
        console.error('getNearbyOutlets error:', error);
        return sendError(res, error.message);
    }
};

// Get featured outlets near location
export const getFeaturedOutlets = async (req: Request, res: Response) => {
    try {
        const { latitude, longitude, limit = DEFAULT_FEATURED_LIMIT } = req.query;

        if (!latitude || !longitude) {
            return sendError(res, 'Latitude and longitude are required', null, 400);
        }

        const lat = parseFloat(latitude as string);
        const lng = parseFloat(longitude as string);
        const limitNum = parseInt(limit as string);

        // Step 1: Find featured outlets nearby
        const featuredOutlets = await Outlet.find({
            status: 'ACTIVE',
            approval_status: 'APPROVED',
            'flags.is_featured': true,
            'location.coordinates': { $exists: true, $ne: [] }
        })
            .populate('brand_id', 'name slug logo_url cuisines verification_status is_active is_featured')
            .lean();


        // Step 2: Filter by approved brands and calculate distance
        const validOutlets = featuredOutlets
            .map(outlet => {
                const brand = outlet.brand_id as any;
                if (!brand || brand.verification_status !== 'approved' || (brand.is_active === false)) {
                    return null;
                }

                if (outlet.location?.coordinates?.length === 2) {
                    const [lng2, lat2] = outlet.location.coordinates;
                    const distance = calculateDistanceKm(lat, lng, lat2, lng2) * 1000;

                    return {
                        ...outlet,
                        distance,
                        brand: mapBrandToResponse(brand)
                    };
                }
                return null;
            })
            .filter(outlet => outlet !== null && outlet.distance <= FALLBACK_RADIUS_METERS)
            .sort((a: any, b: any) => a.distance - b.distance)
            .slice(0, limitNum);

        // Populate is_following if user is logged in
        let followedOutletIds = new Set<string>();
        if ((req as any).user?.id) {
            try {
                const userId = (req as any).user.id;
                const outletIds = validOutlets.map((o: any) => o._id);
                const follows = await Follow.find({ user: userId, outlet: { $in: outletIds } }).select('outlet');
                followedOutletIds = new Set(follows.map(f => f.outlet.toString()));
            } catch (err) {
                console.error('Error fetching follow status for featured outlets:', err);
            }
        }


        const formattedOutlets = validOutlets.map(outlet => {
            if (!outlet) return null;
            return {
                _id: outlet._id,
                name: outlet.name,
                is_following: followedOutletIds.has(outlet._id.toString()),
                slug: outlet.slug,
                address: outlet.address,
                distance: Math.round(outlet.distance),
                avg_rating: outlet.avg_rating,
                total_reviews: outlet.total_reviews,
                price_range: outlet.price_range,
                delivery_time: outlet.delivery_time,
                is_pure_veg: outlet.is_pure_veg,
                media: outlet.media,
                brand: outlet.brand,
                order_phone: outlet.order_phone,
                order_link: outlet.order_link,
                flags: outlet.flags,
                social_media: outlet.social_media
            };
        }).filter(Boolean);

        return sendSuccess(res, { outlets: formattedOutlets });
    } catch (error: any) {
        console.error('getFeaturedOutlets error:', error);
        return sendError(res, error.message);
    }
};

// Toggle featured status (Admin only)
export const toggleFeaturedStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const { is_featured } = req.body;

        // TODO: Add admin role check
        // if (req.user?.role !== 'admin') {
        //     return sendError(res, 'Unauthorized', null, 403);
        // }

        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, 404);
        }

        outlet.flags = {
            is_featured: !!is_featured,
            is_trending: outlet.flags?.is_trending || false,
            accepts_online_orders: outlet.flags?.accepts_online_orders === true,
            is_open_now: outlet.flags?.is_open_now || false
        };

        await outlet.save();


        return sendSuccess(res, {
            outlet: {
                _id: outlet._id,
                name: outlet.name,
                is_featured: outlet.flags?.is_featured
            },
            message: `Outlet ${is_featured ? 'featured' : 'unfeatured'} successfully`
        });
    } catch (error: any) {
        console.error('toggleFeaturedStatus error:', error);
        return sendError(res, error.message);
    }
};

// Add Instagram Reel
export const addInstagramReel = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const { url, title, thumbnail } = req.body;

        // Validate URL format
        if (!url || !INSTAGRAM_REEL_REGEX.test(url)) {
            return sendError(res, 'Invalid Instagram Reel URL format', null, 400);
        }

        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, 404);
        }

        // Check if user has access to this outlet
        if (outlet.created_by_user_id.toString() !== req.user?.id && !req.user?.role?.includes('admin')) {
            return sendError(res, 'Unauthorized', null, 403);
        }

        // Check limit (max 8 reels)
        const currentReels = outlet.instagram_reels || [];
        if (currentReels.length >= MAX_INSTAGRAM_REELS) {
            return sendError(res, `Maximum ${MAX_INSTAGRAM_REELS} Instagram Reels allowed`, null, 400);
        }

        // Check for duplicate URLs
        if (currentReels.some(reel => reel.url === url)) {
            return sendError(res, 'This reel is already added', null, 400);
        }

        // Use provided thumbnail or try to fetch from Instagram
        let thumbnailUrl = thumbnail || '';

        if (!thumbnailUrl) {
            // Try to fetch thumbnail from Instagram (may not always work)
            try {
                const reelMatch = url.match(/instagram\.com\/(reel|reels)\/([A-Za-z0-9_-]+)/);
                const reelShortcode = reelMatch ? reelMatch[2] : null;

                if (reelShortcode) {
                    thumbnailUrl = `https://www.instagram.com/p/${reelShortcode}/media/?size=l`;

                }
            } catch (error) {
                console.warn('⚠️ Could not generate thumbnail URL');
            }
        }

        // Generate unique ID
        const reelId = new mongoose.Types.ObjectId().toString();

        // Create new reel
        const newReel = {
            id: reelId,
            url: url.trim(),
            title: title?.trim() || '',
            thumbnail: thumbnailUrl,
            added_at: new Date(),
            is_active: true,
            order: currentReels.length // Add at the end
        };

        // Add to outlet
        outlet.instagram_reels = [...currentReels, newReel];
        await outlet.save();

        console.log(`🎬 Added Instagram Reel to outlet ${outlet.name}`);

        return sendSuccess(res, {
            reel: newReel,
            message: 'Instagram Reel added successfully'
        });
    } catch (error: any) {
        console.error('addInstagramReel error:', error);
        return sendError(res, error.message);
    }
};

// Delete Instagram Reel
export const deleteInstagramReel = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId, reelId } = req.params;

        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, 404);
        }

        // Check if user has access to this outlet
        if (outlet.created_by_user_id.toString() !== req.user?.id && !req.user?.role?.includes('admin')) {
            return sendError(res, 'Unauthorized', null, 403);
        }

        const currentReels = outlet.instagram_reels || [];
        const reelIndex = currentReels.findIndex(reel => reel.id === reelId);

        if (reelIndex === -1) {
            return sendError(res, 'Reel not found', null, 404);
        }

        // Get the reel to delete its thumbnail from Cloudinary
        const reelToDelete = currentReels[reelIndex];

        // Remove the reel
        currentReels.splice(reelIndex, 1);

        // Re-order remaining reels
        currentReels.forEach((reel, index) => {
            reel.order = index;
        });

        outlet.instagram_reels = currentReels;
        await outlet.save();

        // Delete thumbnail from Cloudinary
        if (reelToDelete?.thumbnail) {
            await deleteFromCloudinary(reelToDelete.thumbnail);
        }

        console.log(`🗑️ Deleted Instagram Reel from outlet ${outlet.name}`);

        return sendSuccess(res, {
            message: 'Instagram Reel deleted successfully'
        });
    } catch (error: any) {
        console.error('deleteInstagramReel error:', error);
        return sendError(res, error.message);
    }
};

// Reorder Instagram Reels
export const reorderInstagramReels = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const { reelIds } = req.body; // Array of reel IDs in new order

        if (!Array.isArray(reelIds)) {
            return sendError(res, 'reelIds must be an array', null, 400);
        }

        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, 404);
        }

        // Check if user has access to this outlet
        if (outlet.created_by_user_id.toString() !== req.user?.id && !req.user?.role?.includes('admin')) {
            return sendError(res, 'Unauthorized', null, 403);
        }

        const currentReels = outlet.instagram_reels || [];

        // Validate that all IDs exist
        if (reelIds.length !== currentReels.length || !reelIds.every(id => currentReels.some(reel => reel.id === id))) {
            return sendError(res, 'Invalid reel IDs provided', null, 400);
        }

        // Reorder reels based on provided IDs
        const reorderedReels = reelIds.map((id, index) => {
            const reel = currentReels.find(r => r.id === id)!;
            return {
                ...reel,
                order: index
            };
        });

        outlet.instagram_reels = reorderedReels;
        await outlet.save();

        console.log(`🔄 Reordered Instagram Reels for outlet ${outlet.name}`);

        return sendSuccess(res, {
            reels: reorderedReels,
            message: 'Instagram Reels reordered successfully'
        });
    } catch (error: any) {
        console.error('reorderInstagramReels error:', error);
        return sendError(res, error.message);
    }
};

// Update Instagram Reel (toggle active status or update title)
export const updateInstagramReel = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId, reelId } = req.params;
        const { is_active, title } = req.body;

        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, 404);
        }

        // Check if user has access to this outlet
        if (outlet.created_by_user_id.toString() !== req.user?.id && !req.user?.role?.includes('admin')) {
            return sendError(res, 'Unauthorized', null, 403);
        }

        const currentReels = outlet.instagram_reels || [];
        const reel = currentReels.find(r => r.id === reelId);

        if (!reel) {
            return sendError(res, 'Reel not found', null, 404);
        }

        // Update fields
        if (typeof is_active === 'boolean') {
            reel.is_active = is_active;
        }
        if (title !== undefined) {
            reel.title = title.trim();
        }

        await outlet.save();

        console.log(`✏️ Updated Instagram Reel for outlet ${outlet.name}`);

        return sendSuccess(res, {
            reel,
            message: 'Instagram Reel updated successfully'
        });
    } catch (error: any) {
        console.error('updateInstagramReel error:', error);
        return sendError(res, error.message);
    }
};

// Get menu settings for an outlet
export const getMenuSettings = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;

        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, 404);
        }

        // Return default settings if not set
        const settings = outlet.menu_settings || {
            default_view_mode: 'grid',
            show_item_images: true,
            show_category_images: true
        };

        return sendSuccess(res, settings);
    } catch (error: any) {
        console.error('getMenuSettings error:', error);
        return sendError(res, error.message);
    }
};

// Update menu settings for an outlet
export const updateMenuSettings = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const { default_view_mode, show_item_images, show_category_images } = req.body;

        const outlet = await Outlet.findById(outletId);
        if (!outlet) {
            return sendError(res, 'Outlet not found', null, 404);
        }

        // Verify user has access to this outlet
        if (outlet.created_by_user_id.toString() !== req.user.id) {
            return sendError(res, 'Unauthorized', null, 403);
        }

        // Update settings
        outlet.menu_settings = {
            default_view_mode: default_view_mode || outlet.menu_settings?.default_view_mode || 'grid',
            show_item_images: show_item_images !== undefined ? show_item_images : (outlet.menu_settings?.show_item_images ?? true),
            show_category_images: show_category_images !== undefined ? show_category_images : (outlet.menu_settings?.show_category_images ?? true)
        };

        await outlet.save();

        console.log(`⚙️ Updated menu settings for outlet ${outlet.name}`);

        return sendSuccess(res, outlet.menu_settings, 'Menu settings updated successfully');
    } catch (error: any) {
        console.error('updateMenuSettings error:', error);
        return sendError(res, error.message);
    }
};

