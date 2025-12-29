import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response.js';
import * as onboardingService from '../services/onboardingService.js';
import * as brandService from '../services/brandService.js';
import * as outletService from '../services/outletService.js';
import { saveBase64Image } from '../utils/fileUpload.js';
import { OnboardingSession } from '../models/OnboardingSession.js';
import { Compliance } from '../models/Compliance.js';

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

        // Validate required fields
        if (!brand || !brand.name) {
            return sendError(res, 'Brand name is required', 400);
        }
        if (!outlet || !outlet.name) {
            return sendError(res, 'Outlet name is required', 400);
        }
        if (!menuStrategy || !['brand', 'outlet'].includes(menuStrategy)) {
            return sendError(res, 'Valid menu strategy is required (brand or outlet)', 400);
        }
        if (!outlet.address1 || !outlet.city || !outlet.state) {
            return sendError(res, 'Complete address is required', 400);
        }

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

        // Log coordinates for debugging
        console.log('📍 Outlet coordinates - Latitude:', outlet.latitude, 'Longitude:', outlet.longitude);
        
        // Validate coordinates if present
        if (outlet.latitude && outlet.longitude) {
            const lat = parseFloat(outlet.latitude);
            const lng = parseFloat(outlet.longitude);
            
            if (isNaN(lat) || isNaN(lng)) {
                return res.status(400).json({ message: 'Invalid coordinates: must be valid numbers' });
            }
            
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                return res.status(400).json({ 
                    message: 'Invalid coordinates: latitude must be between -90 and 90, longitude between -180 and 180' 
                });
            }
            
            console.log('✅ Coordinates validated:', { latitude: lat, longitude: lng });
        } else {
            console.warn('⚠️  No coordinates provided for outlet');
            return res.status(400).json({ message: 'Location coordinates are required. Please select a valid location.' });
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
            location: (outlet.latitude && outlet.longitude) ? {
                type: 'Point',
                coordinates: [parseFloat(outlet.longitude), parseFloat(outlet.latitude)] // [lng, lat]
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

        // Step 3: Create compliance document separately
        let complianceId: string | null = null;
        if (compliance && (compliance.fssai || compliance.gstNo)) {
            try {
                const complianceDoc = await Compliance.create({
                    outlet_id: newOutlet._id,
                    fssai_number: compliance.fssai?.trim(),
                    gst_number: compliance.gstNo?.trim()?.toUpperCase(),
                    gst_percentage: compliance.gstPercent ? parseFloat(compliance.gstPercent) : undefined,
                    is_verified: false
                });
                complianceId = complianceDoc._id.toString();
            } catch (complianceError: any) {
                console.warn('⚠️ Compliance validation error:', complianceError.message);
                // Continue without compliance if validation fails
                // You may want to return error instead based on requirements
            }
        }

        // Step 4: Complete onboarding
        const result = await onboardingService.completeOnboarding(
            req.user.id,
            brandId,
            newOutlet._id.toString(),
            menuStrategy,
            complianceId
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
        
        // Handle mongoose validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((e: any) => e.message).join(', ');
            return sendError(res, `Validation failed: ${messages}`, 400);
        }
        
        // Handle duplicate key errors
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return sendError(res, `${field} already exists`, 409);
        }
        
        return sendError(res, error.message || 'Failed to submit onboarding', 500);
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

/**
 * Save onboarding step progress (draft autosave)
 */
export const saveOnboardingStep = async (req: AuthRequest, res: Response) => {
    try {
        const { stepNum } = req.params;
        const stepData = req.body;
        const stepNumber = parseInt(stepNum);

        if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 6) {
            return sendError(res, 'Invalid step number. Must be between 1 and 6', null, 400);
        }

        // Validate stepData is provided
        if (!stepData || typeof stepData !== 'object') {
            return sendError(res, 'Step data is required and must be an object', null, 400);
        }

        // Find or create active draft session for user
        let session = await OnboardingSession.findOne({ 
            user_id: req.user.id, 
            status: 'draft' 
        }).sort({ updated_at: -1 });

        if (!session) {
            session = await OnboardingSession.create({
                user_id: req.user.id,
                status: 'draft',
                current_step: stepNumber,
                step_data: {}
            });
        }

        // Update step data
        session.current_step = stepNumber;
        session.step_data = {
            ...session.step_data,
            [`step${stepNumber}`]: stepData
        };

        // Store brandId/outletId if provided
        if (stepData.brandId) {
            session.brand_id = stepData.brandId;
        }
        if (stepData.outletId) {
            session.outlet_id = stepData.outletId;
        }

        await session.save();

        return sendSuccess(res, {
            sessionId: session._id,
            currentStep: session.current_step,
            lastSavedAt: session.updated_at
        }, 'Step saved successfully');
    } catch (error: any) {
        console.error('Save step error:', error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((e: any) => e.message).join(', ');
            return sendError(res, `Validation failed: ${messages}`, null, 400);
        }
        
        return sendError(res, error.message || 'Failed to save step', null, 500);
    }
};

/**
 * Get onboarding draft (for resume)
 */
export const getOnboardingDraft = async (req: AuthRequest, res: Response) => {
    try {
        const session = await OnboardingSession.findOne({ 
            user_id: req.user.id, 
            status: 'draft' 
        }).sort({ updated_at: -1 });

        if (!session) {
            return sendSuccess(res, {
                hasDraft: false,
                currentStep: 1
            });
        }

        return sendSuccess(res, {
            hasDraft: true,
            sessionId: session._id,
            currentStep: session.current_step,
            lastSavedAt: session.updated_at,
            brandId: session.brand_id,
            outletId: session.outlet_id,
            stepData: session.step_data
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

/**
 * Get all onboarding sessions (drafts and submitted)
 */
export const getOnboardingSessions = async (req: AuthRequest, res: Response) => {
    try {
        const { status } = req.query;
        const query: any = { user_id: req.user.id };
        
        if (status) {
            query.status = status;
        }

        const sessions = await OnboardingSession.find(query)
            .populate('brand_id', 'name logo_url')
            .populate('outlet_id', 'name')
            .sort({ updated_at: -1 });

        return sendSuccess(res, { sessions });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

/**
 * Delete onboarding draft
 */
export const clearOnboardingDraft = async (req: AuthRequest, res: Response) => {
    try {
        const { sessionId } = req.params;

        if (sessionId) {
            // Delete specific session
            const session = await OnboardingSession.findOne({
                _id: sessionId,
                user_id: req.user.id,
                status: 'draft'
            });

            if (!session) {
                return sendError(res, 'Draft session not found', null, 404);
            }

            await session.deleteOne();
        } else {
            // Delete all draft sessions for user
            await OnboardingSession.deleteMany({
                user_id: req.user.id,
                status: 'draft'
            });
        }

        return sendSuccess(res, null, 'Draft cleared successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

