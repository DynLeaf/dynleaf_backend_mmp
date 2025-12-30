import { Request, Response } from 'express';
import { Brand } from '../models/Brand.js';
import { Outlet } from '../models/Outlet.js';
import { User } from '../models/User.js';
import { sendSuccess, sendError } from '../utils/response.js';
import * as brandService from '../services/brandService.js';
import { saveBase64Image } from '../utils/fileUpload.js';
import mongoose from 'mongoose';

interface AuthRequest extends Request {
    user?: any;
}

export const createBrand = async (req: AuthRequest, res: Response) => {
    try {
        const { name, logo, description, operationModel, cuisines, website, email } = req.body;

        
        
        // Handle logo upload if base64
        let logoUrl = logo;
        if (logo && logo.startsWith('data:')) {
            const uploadResult = await saveBase64Image(logo, 'brands', name);
            logoUrl = uploadResult.url;
        } else if (logo) {
        }

        // Map operation model to operating_modes
        const operatingModes = {
            corporate: operationModel === 'corporate' || operationModel === 'hybrid',
            franchise: operationModel === 'franchise' || operationModel === 'hybrid'
        };

        const brand = await brandService.createBrand(req.user.id, {
            name,
            description,
            logo_url: logoUrl,
            cuisines: cuisines || [],
            operating_modes: operatingModes,
            social_media: {
                website,
                instagram: req.body.instagram
            }
        });

        return sendSuccess(res, { 
            id: brand._id, 
            name: brand.name,
            logo_url: brand.logo_url,
            slug: brand.slug
        }, 'Brand created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getUserBrands = async (req: AuthRequest, res: Response) => {
    try {
        const brands = await brandService.getUserBrands(req.user.id);
        return sendSuccess(res, { brands });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const searchBrands = async (req: AuthRequest, res: Response) => {
    try {
        const { q } = req.query;
        if (!q) {
            const brands = await brandService.getPublicBrands(req.user?.id);
            return sendSuccess(res, { brands });
        }
        const brands = await brandService.searchBrands(q as string, req.user?.id);
        return sendSuccess(res, { brands });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const updateBrand = async (req: AuthRequest, res: Response) => {
    try {
        const { brandId } = req.params;
        const { name, logo, description, cuisines, website, instagram, operationModel } = req.body;

        
        
        // Handle logo upload if base64
        let logoUrl = logo;
        if (logo && logo.startsWith('data:')) {
            const uploadResult = await saveBase64Image(logo, 'brands', name);
            logoUrl = uploadResult.url;
        } else if (logo) {
        }

        const updateData: any = {};
        if (name) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (logoUrl) updateData.logo_url = logoUrl;
        if (cuisines) updateData.cuisines = cuisines;
        if (website || instagram) {
            updateData.social_media = {
                website,
                instagram
            };
        }
        if (operationModel) {
            updateData.operating_modes = {
                corporate: operationModel === 'corporate' || operationModel === 'hybrid',
                franchise: operationModel === 'franchise' || operationModel === 'hybrid'
            };
        }

        const brand = await brandService.updateBrand(brandId, req.user.id, updateData);
        
        if (!brand) {
            return sendError(res, 'Brand not found or unauthorized', null, 404);
        }

        return sendSuccess(res, { 
            id: brand._id, 
            name: brand.name,
            logo_url: brand.logo_url
        }, 'Brand updated successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const joinBrand = async (req: AuthRequest, res: Response) => {
    try {
        const { brandId } = req.params;
        const brand = await Brand.findById(brandId);
        if (!brand) return sendError(res, 'Brand not found', null, 404);

        // Logic to join brand (could be adding to roles)
        await User.findByIdAndUpdate(req.user._id, {
            $push: { roles: { scope: 'brand', role: 'manager', brandId: brand._id } },
            currentStep: 'OUTLET'
        });

        return sendSuccess(res, { id: brand._id, name: brand.name });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const requestAccess = async (req: AuthRequest, res: Response) => {
    return sendSuccess(res, { requestId: 'mock-id', status: 'PENDING' }, 'Access request created', 201);
};

// Get nearby brands based on location
export const getNearbyBrands = async (req: Request, res: Response) => {
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
            isVeg
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

        // First, find nearby outlets using $geoNear
        const nearbyOutletsPipeline: any[] = [
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
                    'brand.is_active': true
                }
            }
        ];

        // Add cuisine filter if provided
        if (cuisines) {
            const cuisineArray = (cuisines as string).split(',');
            nearbyOutletsPipeline.push({
                $match: {
                    'brand.cuisines': { $in: cuisineArray }
                }
            });
        }

        // Group by brand and get nearest outlet
        nearbyOutletsPipeline.push(
            {
                $group: {
                    _id: '$brand_id',
                    brand: { $first: '$brand' },
                    outlets: { $push: '$$ROOT' },
                    minDistance: { $min: '$distance' },
                    avgRating: { $avg: '$avg_rating' },
                    totalReviews: { $sum: '$total_reviews' }
                }
            }
        );

        // Sort based on preference
        if (sortBy === 'rating') {
            nearbyOutletsPipeline.push({ $sort: { avgRating: -1, minDistance: 1 } });
        } else if (sortBy === 'popularity') {
            nearbyOutletsPipeline.push({ $sort: { totalReviews: -1, minDistance: 1 } });
        } else {
            nearbyOutletsPipeline.push({ $sort: { minDistance: 1 } });
        }

        // Add pagination
        nearbyOutletsPipeline.push(
            { $skip: skip },
            { $limit: limitNum }
        );

        // Project final result
        nearbyOutletsPipeline.push({
            $project: {
                _id: '$brand._id',
                name: '$brand.name',
                slug: '$brand.slug',
                logo_url: '$brand.logo_url',
                description: '$brand.description',
                cuisines: '$brand.cuisines',
                is_featured: '$brand.is_featured',
                distance: { $round: ['$minDistance', 0] },
                avg_rating: { $round: ['$avgRating', 1] },
                total_reviews: '$totalReviews',
                outlet_count: { $size: '$outlets' },
                nearest_outlet: {
                    _id: { $arrayElemAt: ['$outlets._id', 0] },
                    name: { $arrayElemAt: ['$outlets.name', 0] },
                    address: { $arrayElemAt: ['$outlets.address', 0] },
                    delivery_time: { $arrayElemAt: ['$outlets.delivery_time', 0] }
                }
            }
        });

        const brands = await Outlet.aggregate(nearbyOutletsPipeline);

        // Count total for pagination
        const countPipeline = nearbyOutletsPipeline.slice(0, -3); // Remove skip, limit, project
        countPipeline.push({ $count: 'total' });
        const countResult = await Outlet.aggregate(countPipeline);
        const total = countResult.length > 0 ? countResult[0].total : 0;

        // If no nearby restaurants, fall back to state-based search
        if (brands.length === 0 && latitude && longitude) {
            // Reverse geocode to get state (you can use a service or store state in user profile)
            // For now, return all active brands
            const fallbackBrands = await Brand.find({
                verification_status: 'approved',
                is_active: true
            })
            .select('name slug logo_url description cuisines is_featured')
            .skip(skip)
            .limit(limitNum)
            .lean();

            const fallbackTotal = await Brand.countDocuments({
                verification_status: 'approved',
                is_active: true
            });

            return sendSuccess(res, {
                brands: fallbackBrands.map(b => ({ ...b, distance: null, outlet_count: 0 })),
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: fallbackTotal,
                    totalPages: Math.ceil(fallbackTotal / limitNum),
                    hasMore: pageNum * limitNum < fallbackTotal
                },
                message: 'No nearby restaurants found. Showing all available restaurants.'
            });
        }

        return sendSuccess(res, {
            brands,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
                hasMore: pageNum * limitNum < total
            }
        });
    } catch (error: any) {
        console.error('getNearbyBrands error:', error);
        return sendError(res, error.message);
    }
};

// Get featured brands near location
export const getFeaturedBrands = async (req: Request, res: Response) => {
    try {
        const { latitude, longitude, limit = 10 } = req.query;
        
        if (!latitude || !longitude) {
            return sendError(res, 'Latitude and longitude are required', null, 400);
        }

        const limitNum = parseInt(limit as string);

        const pipeline = [
            {
                $match: {
                    is_featured: true,
                    is_active: true
                }
            },
            {
                $lookup: {
                    from: 'outlets',
                    localField: '_id',
                    foreignField: 'brand_id',
                    as: 'outlets'
                }
            },
            {
                $addFields: {
                    activeOutlets: {
                        $filter: {
                            input: '$outlets',
                            as: 'outlet',
                            cond: { $eq: ['$$outlet.is_active', true] }
                        }
                    }
                }
            },
            {
                $match: {
                    'activeOutlets.0': { $exists: true }
                }
            },
            {
                $project: {
                    name: 1,
                    slug: 1,
                    logo_url: 1,
                    description: 1,
                    cuisines: 1,
                    social_media: 1,
                    is_featured: 1,
                    outletCount: { $size: '$activeOutlets' }
                }
            },
            { $limit: limitNum }
        ];

        const brands = await Brand.aggregate(pipeline);

        return sendSuccess(res, { brands });
    } catch (error: any) {
        console.error('getFeaturedBrands error:', error);
        return sendError(res, error.message);
    }
};

export const getBrandById = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(brandId)) {
            return sendError(res, 'Invalid brand ID', 400);
        }

        const brand = await Brand.findById(brandId)
            .select('name slug logo_url description cuisines social_media verification_status');

        if (!brand) {
            return sendError(res, 'Brand not found', 404);
        }

        // Get the nearest outlet for this brand
        const outlet = await Outlet.findOne({
            brand_id: brandId,
            status: 'ACTIVE',
            approval_status: 'APPROVED'
        })
            .select('name slug address location contact media flags avg_rating total_reviews is_pure_veg')
            .lean();

        return sendSuccess(res, {
            ...brand.toObject(),
            outlet: outlet || null
        });
    } catch (error: any) {
        console.error('getBrandById error:', error);
        return sendError(res, error.message);
    }
};
