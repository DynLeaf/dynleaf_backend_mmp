import { Request, Response } from 'express';
import { Brand } from '../models/Brand.js';
import { Outlet } from '../models/Outlet.js';
import { User } from '../models/User.js';
import { sendSuccess, sendError } from '../utils/response.js';
import * as brandService from '../services/brandService.js';
import { saveBase64Image } from '../utils/fileUpload.js';
import { BrandUpdateRequest } from '../models/BrandUpdateRequest.js';
import mongoose from 'mongoose';
import { safeDeleteFromCloudinary } from '../services/cloudinaryService.js';

interface AuthRequest extends Request {
    user?: any;
}

// Helper functions
const handleLogoUpload = async (logo: string, name: string): Promise<string> => {
    if (!logo) return logo;
    if (logo.startsWith('data:')) {
        const uploadResult = await saveBase64Image(logo, 'brands', name);
        return uploadResult.url;
    }
    return logo;
};

const mapOperationModelToModes = (operationModel: string) => ({
    corporate: operationModel === 'corporate' || operationModel === 'hybrid',
    franchise: operationModel === 'franchise' || operationModel === 'hybrid'
});

const parseIntOrDefault = (value: any, defaultValue: number): number => {
    const parsed = parseInt(value as string);
    return isNaN(parsed) ? defaultValue : parsed;
};

const parseFloatSafe = (value: any): number => {
    const parsed = parseFloat(value as string);
    return isNaN(parsed) ? 0 : parsed;
};

const calculatePagination = (page: number, limit: number, total: number) => ({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total
});

const isApprovedStatus = (status: string): boolean => {
    return status?.toLowerCase() === 'approved';
};

const buildUpdateData = (params: any, brand: any) => {
    const { name, description, logoUrl, cuisines, website, instagram, operationModel } = params;
    const updateData: any = {};

    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (logoUrl) updateData.logo_url = logoUrl;
    if (cuisines) updateData.cuisines = cuisines;

    const social_media = { ...(brand.social_media || {}) };
    if (website !== undefined) social_media.website = website;
    if (instagram !== undefined) social_media.instagram = instagram;
    updateData.social_media = social_media;

    if (operationModel) {
        updateData.operating_modes = mapOperationModelToModes(operationModel);
    }

    return updateData;
};

export const createBrand = async (req: AuthRequest, res: Response) => {
    try {
        const { name, logo, description, operationModel, cuisines, website, email } = req.body;

        const logoUrl = await handleLogoUpload(logo, name);
        const operatingModes = mapOperationModelToModes(operationModel);

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
            slug: brand.slug,
            status: brand.verification_status
        }, 'Brand created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getUserBrands = async (req: AuthRequest, res: Response) => {
    try {
        const brands = await brandService.getUserBrands(req.user.id);
        const brandIds = brands.map(b => b._id);
        const pendingRequests = await BrandUpdateRequest.find({
            brand_id: { $in: brandIds },
            status: 'pending'
        }).select('brand_id').lean();

        const pendingByBrandId = new Set(pendingRequests.map(r => String(r.brand_id)));

        const mappedBrands = brands.map(b => ({
            ...b.toObject(),
            status: b.verification_status,
            has_pending_update: pendingByBrandId.has(String(b._id))
        }));
        return sendSuccess(res, { brands: mappedBrands });
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

        const logoUrl = await handleLogoUpload(logo, name);

        const brand = await Brand.findById(brandId);
        if (!brand) {
            return sendError(res, 'Brand not found', null, 404);
        }

        if (brand.admin_user_id.toString() !== req.user.id.toString()) {
            return sendError(res, 'Unauthorized to update this brand', null, 403);
        }

        const updateData = buildUpdateData(
            { name, description, logoUrl, cuisines, website, instagram, operationModel },
            brand
        );

        const currentStatus = brand.verification_status?.toLowerCase();
        console.log(`[UpdateBrand] Brand ${brandId} status: ${brand.verification_status} (normalized: ${currentStatus})`);

        if (isApprovedStatus(currentStatus)) {
            console.log(`[UpdateBrand] Creating/Updating BrandUpdateRequest for approved brand ${brandId}`);
            try {
                const newData = {
                    name: updateData.name || brand.name,
                    description: updateData.description !== undefined ? updateData.description : brand.description,
                    logo_url: updateData.logo_url || brand.logo_url,
                    cuisines: updateData.cuisines || brand.cuisines,
                    operating_modes: updateData.operating_modes || brand.operating_modes,
                    social_media: updateData.social_media || brand.social_media
                };

                const existingPending = await BrandUpdateRequest.findOne({
                    brand_id: brandId,
                    status: 'pending'
                });

                if (existingPending) {
                    existingPending.new_data = newData as any;
                    await existingPending.save();
                    console.log(`[UpdateBrand] Updated existing pending request: ${existingPending._id}`);

                    return sendSuccess(res, {
                        id: brand._id,
                        name: brand.name,
                        logo_url: brand.logo_url,
                        status: 'pending_approval',
                        request_id: existingPending._id
                    }, 'Changes updated and submitted for admin approval');
                }

                const newRequest = await BrandUpdateRequest.create({
                    brand_id: brandId,
                    requester_id: req.user.id || req.user._id,
                    old_data: {
                        name: brand.name,
                        description: brand.description,
                        logo_url: brand.logo_url,
                        cuisines: brand.cuisines,
                        operating_modes: brand.operating_modes,
                        social_media: brand.social_media
                    },
                    new_data: newData
                });
                console.log(`[UpdateBrand] Request created successfully with ID: ${newRequest._id}`);

                return sendSuccess(res, {
                    id: brand._id,
                    name: brand.name,
                    logo_url: brand.logo_url,
                    status: 'pending_approval',
                    request_id: newRequest._id
                }, 'Changes submitted for admin approval');
            } catch (err: any) {
                console.error(`[UpdateBrand] Failed to create request: ${err.message}`);
                throw err;
            }
        }

        console.log(`[UpdateBrand] Direct update for brand ${brandId} (not approved yet)`);

        // If a brand was rejected, treat an edit as a resubmission: reset to pending for re-verification.
        if (currentStatus === 'rejected') {
            updateData.verification_status = 'pending';
            updateData.verified_by = undefined;
            updateData.verified_at = undefined;
        }

        // If not approved yet, update directly
        const updatedBrand = await brandService.updateBrand(brandId, req.user.id, updateData);

        // Delete old logo from Cloudinary if logo was updated
        if (logoUrl && brand.logo_url) {
            await safeDeleteFromCloudinary(brand.logo_url, logoUrl);
        }

        return sendSuccess(res, {
            id: updatedBrand!._id,
            name: updatedBrand!.name,
            logo_url: updatedBrand!.logo_url,
            status: updatedBrand!.verification_status
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
            radius = 10000,
            page = 1,
            limit = 20,
            cuisines,
            priceRange,
            minRating,
            sortBy = 'distance',
            isVeg
        } = req.query;

        if (!latitude || !longitude) {
            return sendError(res, 'Latitude and longitude are required', null, 400);
        }

        const lat = parseFloatSafe(latitude);
        const lng = parseFloatSafe(longitude);
        const radiusMeters = parseIntOrDefault(radius, 10000);
        const pageNum = parseIntOrDefault(page, 1);
        const limitNum = parseIntOrDefault(limit, 20);
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

        const countPipeline = nearbyOutletsPipeline.slice(0, -3);
        countPipeline.push({ $count: 'total' });
        const countResult = await Outlet.aggregate(countPipeline);
        const total = countResult.length > 0 ? countResult[0].total : 0;

        if (brands.length === 0 && latitude && longitude) {
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
                pagination: calculatePagination(pageNum, limitNum, fallbackTotal),
                message: 'No nearby restaurants found. Showing all available restaurants.'
            });
        }

        return sendSuccess(res, {
            brands,
            pagination: calculatePagination(pageNum, limitNum, total)
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

        const limitNum = parseIntOrDefault(limit, 10);

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
            return sendError(res, 'Invalid brand ID', null, 400);
        }

        const brand = await Brand.findById(brandId)
            .select('name slug logo_url description cuisines social_media verification_status is_branded brand_theme');

        if (!brand) {
            return sendError(res, 'Brand not found', null, 404);
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

// Update brand theme colors
export const updateBrandTheme = async (req: AuthRequest, res: Response) => {
    try {
        const { brandId } = req.params;
        const { primary_color } = req.body;

        // Validate hex color format
        if (!primary_color || !/^#[0-9A-F]{6}$/i.test(primary_color)) {
            return sendError(res, 'Invalid color format. Please provide a valid hex color (e.g., #FF5733)', null, 400);
        }

        // Find the brand
        const brand = await Brand.findById(brandId);
        if (!brand) {
            return sendError(res, 'Brand not found', null, 404);
        }

        // Check if brand is branded
        if (!brand.is_branded) {
            return sendError(res, 'Brand color customization is not available for this brand', null, 403);
        }

        // TODO: Add authorization check to ensure user owns this brand
        // For now, we'll allow any authenticated user (will be secured later)

        // Update brand theme
        brand.brand_theme = {
            ...brand.brand_theme,
            primary_color
        };
        await brand.save();

        return sendSuccess(res, { brand_theme: brand.brand_theme }, 'Brand color updated successfully');
    } catch (error: any) {
        console.error('Update brand theme error:', error);
        return sendError(res, error.message || 'Failed to update brand theme');
    }
};
