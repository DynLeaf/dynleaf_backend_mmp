import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response.js';
import * as onboardingService from '../services/onboardingService.js';
import * as brandService from '../services/brandService.js';
import * as outletService from '../services/outletService.js';
import { saveBase64Image } from '../utils/fileUpload.js';

interface AuthRequest extends Request {
    user?: any;
}

/**
 * Submit complete onboarding
 */
export const submitOnboarding = async (req: AuthRequest, res: Response) => {
    try {
        const {
            brand,
            outlet,
            menuStrategy,
            compliance
        } = req.body;

        // Step 1: Create or get brand
        let brandId = brand.id;
        if (!brandId) {
            // Handle logo upload
            let logoUrl = brand.logo;
            console.log('📸 Onboarding brand logo:', logoUrl ? `${logoUrl.substring(0, 50)}...` : 'No logo');
            if (logoUrl && logoUrl.startsWith('data:')) {
                console.log('💾 Saving brand logo to brands folder...');
                const uploadResult = await saveBase64Image(logoUrl, 'brands', brand.name);
                logoUrl = uploadResult.url;
                console.log('✅ Brand logo saved, URL:', logoUrl);
            } else if (logoUrl) {
                console.log('⚠️ Brand logo provided but not base64, using as-is:', logoUrl);
            }

            // Map operation model
            const operatingModes = {
                corporate: brand.operationModel === 'corporate' || brand.operationModel === 'hybrid',
                franchise: brand.operationModel === 'franchise' || brand.operationModel === 'hybrid'
            };

            const newBrand = await brandService.createBrand(req.user.id, {
                name: brand.name,
                description: brand.description,
                logo_url: logoUrl,
                cuisines: brand.cuisines || [],
                operating_modes: operatingModes,
                social_media: {
                    website: brand.website,
                    instagram: brand.instagram
                }
            });
            brandId = newBrand._id.toString();
        }

        // Step 2: Create outlet
        let coverImageUrl = outlet.coverImage;
        console.log('📸 Onboarding outlet cover:', coverImageUrl ? `${coverImageUrl.substring(0, 50)}...` : 'No cover');
        if (coverImageUrl && coverImageUrl.startsWith('data:')) {
            console.log('💾 Saving outlet cover to outlets folder...');
            const uploadResult = await saveBase64Image(coverImageUrl, 'outlets', outlet.name);
            coverImageUrl = uploadResult.url;
            console.log('✅ Outlet cover saved, URL:', coverImageUrl);
        } else if (coverImageUrl) {
            console.log('⚠️ Outlet cover provided but not base64, using as-is:', coverImageUrl);
        }

        const newOutlet = await outletService.createOutlet(req.user.id, brandId, {
            name: outlet.name,
            contact: {
                phone: outlet.phones?.[0],
                email: outlet.email
            },
            address: {
                full: outlet.address1,
                city: outlet.city,
                state: outlet.state,
                country: 'India',
                pincode: outlet.zip
            },
            location: outlet.location ? {
                coordinates: [outlet.location.lng, outlet.location.lat]
            } : undefined,
            media: {
                cover_image_url: coverImageUrl
            },
            restaurant_type: outlet.dietaryType,
            vendor_types: outlet.vendorTypes || [],
            seating_capacity: outlet.seatingCapacity ? parseInt(outlet.seatingCapacity) : undefined,
            table_count: outlet.tableCount ? parseInt(outlet.tableCount) : undefined,
            social_media: outlet.socialLinks
        });

        // Step 3: Complete onboarding
        const result = await onboardingService.completeOnboarding(
            req.user.id,
            brandId,
            newOutlet._id.toString(),
            menuStrategy,
            compliance
        );

        // Get updated user data
        const updatedUser = result.user;
        
        return sendSuccess(res, {
            onboardingRequest: {
                id: result.onboardingRequest._id,
                status: result.onboardingRequest.status
            },
            brand: {
                id: brandId
            },
            outlet: {
                id: newOutlet._id,
                name: newOutlet.name
            },
            user: updatedUser ? {
                id: updatedUser._id,
                hasCompletedOnboarding: updatedUser.roles?.some((r: any) => r.role === 'restaurant_owner') && updatedUser.currentStep === 'DONE',
                roles: updatedUser.roles,
                currentStep: updatedUser.currentStep,
                onboardingStatus: result.onboardingRequest.status
            } : null
        }, 'Onboarding submitted successfully', 201);
    } catch (error: any) {
        console.error('Onboarding submission error:', error);
        return sendError(res, error.message);
    }
};

/**
 * Get user's onboarding status
 */
export const getOnboardingStatus = async (req: AuthRequest, res: Response) => {
    try {
        const onboardingRequest = await onboardingService.getUserOnboardingRequest(req.user.id);
        
        if (!onboardingRequest) {
            return sendSuccess(res, {
                status: 'not_started',
                hasOnboarding: false
            });
        }

        return sendSuccess(res, {
            status: onboardingRequest.status,
            hasOnboarding: true,
            onboardingRequest: {
                id: onboardingRequest._id,
                status: onboardingRequest.status,
                submitted_at: onboardingRequest.submitted_at,
                menu_strategy: onboardingRequest.menu_strategy
            }
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

/**
 * Get pending onboarding requests (Admin only)
 */
export const getPendingRequests = async (req: AuthRequest, res: Response) => {
    try {
        const requests = await onboardingService.getPendingOnboardingRequests();
        return sendSuccess(res, { requests });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

/**
 * Approve onboarding request (Admin only)
 */
export const approveOnboarding = async (req: AuthRequest, res: Response) => {
    try {
        const { requestId } = req.params;
        const request = await onboardingService.approveOnboardingRequest(requestId, req.user.id);
        
        if (!request) {
            return sendError(res, 'Onboarding request not found', null, 404);
        }

        return sendSuccess(res, {
            id: request._id,
            status: request.status
        }, 'Onboarding approved successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

/**
 * Reject onboarding request (Admin only)
 */
export const rejectOnboarding = async (req: AuthRequest, res: Response) => {
    try {
        const { requestId } = req.params;
        const { reason } = req.body;

        if (!reason) {
            return sendError(res, 'Rejection reason is required', null, 400);
        }

        const request = await onboardingService.rejectOnboardingRequest(requestId, req.user.id, reason);
        
        if (!request) {
            return sendError(res, 'Onboarding request not found', null, 404);
        }

        return sendSuccess(res, {
            id: request._id,
            status: request.status
        }, 'Onboarding rejected');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};
