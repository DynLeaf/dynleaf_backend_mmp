import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response.js';
import * as onboardingService from '../services/onboardingService.js';
import * as onboardingDraftService from '../services/onboarding/onboardingDraftService.js';
import * as brandService from '../services/brandService.js';
import * as outletService from '../services/outletService.js';
import { getS3Service } from '../services/s3Service.js';
import { saveOperatingHoursFromOnboarding } from '../services/operatingHoursService.js';
import { validateOptionalHttpUrl } from '../utils/url.js';
import { saveBase64Image } from '../utils/fileUpload.js';
import { sendBrandOnboardingEmail, sendOutletOnboardingEmail } from '../services/emailService.js';
import { createAdminNotification } from '../services/adminNotificationService.js';

const VALID_MENU_STRATEGIES = ['brand', 'outlet'];
const MIN_STEP = 1;
const MAX_STEP = 6;
const COORDINATE_LIMITS = { LAT_MIN: -90, LAT_MAX: 90, LNG_MIN: -180, LNG_MAX: 180 };

interface AuthRequest extends Request {
    user?: { id: string; email?: string; phone?: string };
}

const validateMenuStrategy = (strategy: string): boolean => VALID_MENU_STRATEGIES.includes(strategy);

const validateRequiredFields = (brand: Record<string, unknown>, outlet: Record<string, unknown>): string | null => {
    if (!brand?.name) return 'Brand name is required';
    if (!outlet?.name) return 'Outlet name is required';
    if (!outlet.address1 || !outlet.city || !outlet.state) return 'Complete address is required';
    return null;
};

const validateCoordinates = (lat: number, lng: number): string | null => {
    if (isNaN(lat) || isNaN(lng)) return 'Invalid coordinates: must be valid numbers';
    if (lat < COORDINATE_LIMITS.LAT_MIN || lat > COORDINATE_LIMITS.LAT_MAX ||
        lng < COORDINATE_LIMITS.LNG_MIN || lng > COORDINATE_LIMITS.LNG_MAX) {
        return 'Invalid coordinates: latitude must be between -90 and 90, longitude between -180 and 180';
    }
    return null;
};

export const submitOnboarding = async (req: AuthRequest, res: Response) => {
    try {
        const { brand, outlet, menuStrategy, compliance } = req.body as {
            brand: Record<string, unknown>;
            outlet: Record<string, unknown>;
            menuStrategy: string;
            compliance: { fssai?: string; gstNo?: string; gstPercent?: string };
        };

        validateOptionalHttpUrl('Google review link', (outlet?.socialLinks as Record<string, unknown>)?.google_review as string);
        const fieldError = validateRequiredFields(brand, outlet);
        if (fieldError) return sendError(res, fieldError, null, 400);
        if (!menuStrategy || !validateMenuStrategy(menuStrategy)) {
            return sendError(res, 'Valid menu strategy is required (brand or outlet)', null, 400);
        }

        let brandId = brand.id as string | undefined;
        if (!brandId) {
            let logoUrl = brand.logo as string | undefined;
            if (logoUrl?.startsWith('data:')) {
                const s3Service = getS3Service();
                const matches = logoUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
                if (!matches || matches.length !== 3) throw new Error('Invalid base64 string');
                const buffer = Buffer.from(matches[2], 'base64');
                const uploadedFile = await s3Service.uploadBuffer(buffer, 'brand_logo', (brand._id as { toString(): string })?.toString?.() || 'unknown', `logo-${Date.now()}`, matches[1]);
                logoUrl = uploadedFile.key;
            }
            const operatingModes = {
                corporate: brand.operationModel === 'corporate' || brand.operationModel === 'hybrid',
                franchise: brand.operationModel === 'franchise' || brand.operationModel === 'hybrid'
            };
            const newBrand = await brandService.createBrand(req.user!.id, {
                name: brand.name as string,
                description: brand.description as string,
                logo_url: logoUrl,
                cuisines: (brand.cuisines as string[]) || [],
                operating_modes: operatingModes,
                social_media: { website: brand.website as string, instagram: brand.instagram as string }
            });
            brandId = (newBrand as unknown as { _id: { toString(): string } })._id.toString();
        }

        let coverImageUrl = outlet.coverImage as string | undefined;
        if (coverImageUrl?.startsWith('data:')) {
            const uploadResult = await saveBase64Image(coverImageUrl, 'outlets', outlet.name as string);
            coverImageUrl = uploadResult.url;
        }

        if (!outlet.latitude || !outlet.longitude) {
            return sendError(res, 'Location coordinates are required. Please select a valid location.', null, 400);
        }
        const lat = parseFloat(outlet.latitude as string);
        const lng = parseFloat(outlet.longitude as string);
        const coordError = validateCoordinates(lat, lng);
        if (coordError) return sendError(res, coordError, null, 400);

        const newOutlet = await outletService.createOutlet(req.user!.id, brandId!, {
            name: outlet.name as string,
            contact: { phone: (outlet.phones as string[])?.[0], email: outlet.email as string },
            address: { full: outlet.address1 as string, city: outlet.city as string, state: outlet.state as string, country: 'India', pincode: outlet.zip as string },
            location: { type: 'Point', coordinates: [lng, lat] },
            media: { cover_image_url: coverImageUrl },
            restaurant_type: outlet.dietaryType as string,
            vendor_types: (outlet.vendorTypes as string[]) || [],
            seating_capacity: outlet.seatingCapacity ? parseInt(outlet.seatingCapacity as string) : undefined,
            table_count: outlet.tableCount ? parseInt(outlet.tableCount as string) : undefined,
            social_media: outlet.socialLinks as Record<string, string>,
            referral_code: outlet.referralCode as string
        });

        if (outlet.operatingHours && Array.isArray(outlet.operatingHours)) {
            try {
                const outletId = (newOutlet as unknown as { _id: { toString(): string } })._id.toString();
                await saveOperatingHoursFromOnboarding(outletId, outlet.operatingHours as any[]);
            } catch (hoursError: unknown) {
                console.warn('⚠️ Failed to save operating hours:', (hoursError as Error).message);
            }
        }

        const outletId = (newOutlet as unknown as { _id: { toString(): string } })._id.toString();
        const complianceRecord = await onboardingDraftService.createComplianceRecord(outletId, compliance ?? {});
        const complianceId = complianceRecord?.id ?? null;

        const result = await onboardingService.completeOnboarding(
            req.user!.id, brandId!, outletId.toString(), menuStrategy as 'brand' | 'outlet', complianceId
        );

        const createdByEmail = req.user?.email || req.user?.phone || 'Unknown';
        const createdAt = new Date();
        if (!brand.id) {
            sendBrandOnboardingEmail(brand.name as string, createdAt, createdByEmail);
            createAdminNotification({ title: 'New Brand Onboarded', message: `"${brand.name}" is waiting for approval.`, type: 'brand', referenceId: brandId! });
        }
        sendOutletOnboardingEmail((newOutlet as unknown as { name: string }).name, (brand.name as string) || 'Unknown Brand', createdAt, createdByEmail);
        createAdminNotification({ title: 'New Outlet Onboarded', message: `"${(newOutlet as unknown as { name: string }).name}" is waiting for approval.`, type: 'outlet', referenceId: outletId.toString() });

        const updatedUser = result.user as { _id: unknown; roles: { role: string }[]; currentStep: string } | null;
        return sendSuccess(res, {
            onboardingRequest: { id: result.onboardingRequest._id, status: result.onboardingRequest.status },
            brand: { id: brandId },
            outlet: { id: outletId, name: (newOutlet as unknown as { name: string }).name },
            user: updatedUser ? {
                id: updatedUser._id,
                hasCompletedOnboarding: updatedUser.roles?.some(r => r.role === 'restaurant_owner') && updatedUser.currentStep === 'DONE',
                roles: updatedUser.roles,
                currentStep: updatedUser.currentStep,
                onboardingStatus: result.onboardingRequest.status
            } : null
        }, 'Onboarding submitted successfully', 201);
    } catch (error: unknown) {
        const err = error as { name?: string; errors?: Record<string, { message: string }>; code?: number; keyPattern?: Record<string, unknown>; statusCode?: number; message?: string };
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors ?? {}).map(e => e.message).join(', ');
            return sendError(res, `Validation failed: ${messages}`, 400);
        }
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern ?? {})[0];
            return sendError(res, `${field} already exists`, 409);
        }
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        return sendError(res, err.message || 'Failed to submit onboarding', err, statusCode);
    }
};

export const getOnboardingStatus = async (req: AuthRequest, res: Response) => {
    try {
        const onboardingRequest = await onboardingService.getUserOnboardingRequest(req.user!.id) as {
            _id: unknown; status: string; submitted_at: Date; menu_strategy: string;
        } | null;
        if (!onboardingRequest) return sendSuccess(res, { status: 'not_started', hasOnboarding: false });
        return sendSuccess(res, {
            status: onboardingRequest.status, hasOnboarding: true,
            onboardingRequest: { id: onboardingRequest._id, status: onboardingRequest.status, submitted_at: onboardingRequest.submitted_at, menu_strategy: onboardingRequest.menu_strategy }
        });
    } catch (error: unknown) { return sendError(res, (error as Error).message); }
};

export const getPendingRequests = async (req: AuthRequest, res: Response) => {
    try {
        const requests = await onboardingService.getPendingOnboardingRequests();
        return sendSuccess(res, { requests });
    } catch (error: unknown) { return sendError(res, (error as Error).message); }
};

export const approveOnboarding = async (req: AuthRequest, res: Response) => {
    try {
        const request = await onboardingService.approveOnboardingRequest(req.params.requestId, req.user!.id) as { _id: unknown; status: string } | null;
        if (!request) return sendError(res, 'Onboarding request not found', null, 404);
        return sendSuccess(res, { id: request._id, status: request.status }, 'Onboarding approved successfully');
    } catch (error: unknown) { return sendError(res, (error as Error).message); }
};

export const rejectOnboarding = async (req: AuthRequest, res: Response) => {
    try {
        const { reason } = req.body as { reason: string };
        if (!reason) return sendError(res, 'Rejection reason is required', null, 400);
        const request = await onboardingService.rejectOnboardingRequest(req.params.requestId, req.user!.id, reason) as { _id: unknown; status: string } | null;
        if (!request) return sendError(res, 'Onboarding request not found', null, 404);
        return sendSuccess(res, { id: request._id, status: request.status }, 'Onboarding rejected');
    } catch (error: unknown) { return sendError(res, (error as Error).message); }
};

export const saveOnboardingStep = async (req: AuthRequest, res: Response) => {
    try {
        const { stepNum } = req.params;
        const stepData = req.body as Record<string, unknown>;
        const stepNumber = parseInt(stepNum);
        if (isNaN(stepNumber) || stepNumber < MIN_STEP || stepNumber > MAX_STEP) {
            return sendError(res, `Invalid step number. Must be between ${MIN_STEP} and ${MAX_STEP}`, null, 400);
        }
        if (!stepData || typeof stepData !== 'object') {
            return sendError(res, 'Step data is required and must be an object', null, 400);
        }
        const result = await onboardingDraftService.saveOnboardingStep(req.user!.id, stepNumber, stepData);
        return sendSuccess(res, result, 'Step saved successfully');
    } catch (error: unknown) {
        return sendError(res, (error as Error).message || 'Failed to save step', null, 500);
    }
};

export const getOnboardingDraft = async (req: AuthRequest, res: Response) => {
    try {
        const result = await onboardingDraftService.getOnboardingDraft(req.user!.id);
        return sendSuccess(res, result);
    } catch (error: unknown) { return sendError(res, (error as Error).message); }
};

export const getOnboardingSessions = async (req: AuthRequest, res: Response) => {
    try {
        const { status } = req.query as { status?: string };
        const sessions = await onboardingDraftService.getOnboardingSessions(req.user!.id, status);
        return sendSuccess(res, { sessions });
    } catch (error: unknown) { return sendError(res, (error as Error).message); }
};

export const clearOnboardingDraft = async (req: AuthRequest, res: Response) => {
    try {
        const { sessionId } = req.params;
        await onboardingDraftService.clearOnboardingDraft(req.user!.id, sessionId);
        return sendSuccess(res, null, 'Draft cleared successfully');
    } catch (error: unknown) {
        const msg = (error as Error).message;
        if (msg === 'Draft session not found') return sendError(res, msg, null, 404);
        return sendError(res, msg);
    }
};
