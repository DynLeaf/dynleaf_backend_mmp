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

        // Handle cover image upload if base64
        let coverImageUrl = coverImage;
        if (coverImage && coverImage.startsWith('data:')) {
            const uploadResult = await saveBase64Image(coverImage, 'outlets');
            coverImageUrl = uploadResult.url;
        }

        // Prepare location object with GeoJSON format
        let locationData = location;
        if (latitude && longitude) {
            locationData = {
                type: 'Point',
                coordinates: [parseFloat(longitude), parseFloat(latitude)] // [lng, lat]
            };
        }

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
        const { outletId } = req.params;
        const outlet = await outletService.getOutletById(outletId);
        
        if (!outlet) {
            return sendError(res, 'Outlet not found', 404);
        }
        
        return sendSuccess(res, { outlet });
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

        // Handle opening hours
        if (updateData.openingHours !== undefined) {
            updateData.opening_hours = updateData.openingHours;
            delete updateData.openingHours;
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

export const uploadPhotoGallery = async (req: AuthRequest, res: Response) => {
    try {
        const { outletId } = req.params;
        const { category, image } = req.body;

        if (!category || !['interior', 'exterior', 'food'].includes(category)) {
            return sendError(res, 'Invalid category. Must be interior, exterior, or food', null, 400);
        }

        if (!image || !image.startsWith('data:')) {
            return sendError(res, 'Invalid image data', null, 400);
        }

        // Upload image to server in category-specific folder
        const folderPath = `gallery/${category}` as 'gallery/interior' | 'gallery/exterior' | 'gallery/food';
        const uploadResult = await saveBase64Image(image, folderPath, `${category}-${Date.now()}`);

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
        outlet.photo_gallery[category as 'interior' | 'exterior' | 'food']!.push(uploadResult.url);

        await outlet.save();

        return sendSuccess(res, { 
            url: uploadResult.url,
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

        if (!category || !['interior', 'exterior', 'food'].includes(category)) {
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

        return sendSuccess(res, null, 'Photo deleted successfully');
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

// Get all outlets for a brand (public route)
export const getBrandOutlets = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        
        const outlets = await Outlet.find({ 
            brand_id: brandId,
            is_active: true 
        }).populate('brand_id', 'name logo_url').lean();

        const formattedOutlets = outlets.map(outlet => ({
            id: outlet._id,
            name: outlet.name,
            address: outlet.address,
            location: outlet.location,
            contact: outlet.contact,
            coverImage: outlet.media?.cover_image_url,
            seatingCapacity: outlet.seating_capacity,
            restaurantType: outlet.restaurant_type,
            socialMedia: outlet.social_media,
            isActive: (outlet as any).is_active || true
        }));

        return sendSuccess(res, { outlets: formattedOutlets });
    } catch (error: any) {
        console.error('getBrandOutlets error:', error);
        return sendError(res, error.message);
    }
};

// Get nearby outlets based on location with filters (like Zomato/Swiggy)
export const getNearbyOutlets = async (req: Request, res: Response) => {
    try {
        const { 
            latitude, 
            longitude, 
            radius = 10000, // Default 10km in meters
            page = 1, 
            limit = 20,
            cuisines,
            priceRange,
            minRating,
            sortBy = 'distance', // distance, rating, popularity
            isVeg,
            search
        } = req.query;
        
        if (!latitude || !longitude) {
            return sendError(res, 'Latitude and longitude are required', null, 400);
        }

        const lat = parseFloat(latitude as string);
        const lng = parseFloat(longitude as string);
        const radiusMeters = parseInt(radius as string);
        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;

        // Build match query for outlets
        const outletMatchQuery: any = {
            status: 'ACTIVE',
            approval_status: 'APPROVED',
            'location.coordinates': { $exists: true, $ne: [] }
        };

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
                $match: {
                    'brand.verification_status': 'approved',
                    $or: [
                        { 'brand.is_active': true },
                        { 'brand.is_active': { $exists: false } } // Include brands where is_active is not set
                    ]
                }
            }
        ];

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
            .select('name slug address location avg_rating total_reviews price_range delivery_time is_pure_veg media contact')
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
        const { latitude, longitude, limit = 10 } = req.query;
        
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

        console.log(`🌟 Found ${featuredOutlets.length} featured outlets`);

        // Step 2: Filter by approved brands and calculate distance
        const validOutlets = featuredOutlets
            .map(outlet => {
                const brand = outlet.brand_id as any;
                if (!brand || brand.verification_status !== 'approved' || (brand.is_active === false)) {
                    return null;
                }

                if (outlet.location?.coordinates?.length === 2) {
                    const [lng2, lat2] = outlet.location.coordinates;
                    const distance = calculateDistance(lat, lng, lat2, lng2);
                    
                    return {
                        ...outlet,
                        distance,
                        brand: {
                            _id: brand._id,
                            name: brand.name,
                            slug: brand.slug,
                            logo_url: brand.logo_url,
                            cuisines: brand.cuisines,
                            is_featured: brand.is_featured
                        }
                    };
                }
                return null;
            })
            .filter(outlet => outlet !== null && outlet.distance <= 50000) // 50km radius
            .sort((a: any, b: any) => a.distance - b.distance)
            .slice(0, limitNum);

        console.log(`✅ Returning ${validOutlets.length} featured outlets`);

        const formattedOutlets = validOutlets.map(outlet => ({
            _id: outlet._id,
            name: outlet.name,
            slug: outlet.slug,
            address: outlet.address,
            distance: Math.round(outlet.distance),
            avg_rating: outlet.avg_rating,
            total_reviews: outlet.total_reviews,
            price_range: outlet.price_range,
            delivery_time: outlet.delivery_time,
            is_pure_veg: outlet.is_pure_veg,
            media: outlet.media,
            brand: outlet.brand
        }));

        return sendSuccess(res, { outlets: formattedOutlets });
    } catch (error: any) {
        console.error('getFeaturedOutlets error:', error);
        return sendError(res, error.message);
    }
};

// Helper function to calculate distance
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

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
            ...outlet.flags,
            is_featured: is_featured
        };

        await outlet.save();

        console.log(`🌟 Outlet ${outlet.name} featured status set to: ${is_featured}`);

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
