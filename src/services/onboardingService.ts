import * as onboardingRequestRepo from '../repositories/onboarding/onboardingRequestRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import * as brandMemberRepository from '../repositories/brand/brandMemberRepository.js';
import * as outletRepository from '../repositories/outletRepository.js';
import mongoose from 'mongoose';
import type { IOnboardingRequest } from '../models/OnboardingRequest.js';

/**
 * Create onboarding request
 */
export const createOnboardingRequest = async (
    userId: string,
    brandId: string,
    outletId: string,
    menuStrategy: 'brand' | 'outlet',
    complianceId?: string | null
): Promise<unknown> => {
    return await onboardingRequestRepo.createRequest({
        user_id: userId,
        brand_id: brandId,
        outlet_id: outletId,
        menu_strategy: menuStrategy,
        status: 'pending_approval',
        submitted_at: new Date(),
        compliance_id: complianceId ? new mongoose.Types.ObjectId(complianceId) : undefined
    });
};

/**
 * Get user's onboarding request
 */
export const getUserOnboardingRequest = async (userId: string): Promise<unknown> => {
    return await onboardingRequestRepo.findByUserId(userId);
};

/**
 * Update onboarding status
 */
export const updateOnboardingStatus = async (
    requestId: string,
    status: 'pending_details' | 'pending_approval' | 'approved' | 'rejected',
    reviewedBy?: string,
    rejectionReason?: string
): Promise<unknown> => {
    const request = await onboardingRequestRepo.findById(requestId);
    
    if (!request) {
        throw new Error('Onboarding request not found');
    }

    return await onboardingRequestRepo.updateStatus(requestId, {
        status,
        ...(status === 'approved' || status === 'rejected' ? {
            reviewed_by: reviewedBy ? new mongoose.Types.ObjectId(reviewedBy) : undefined,
            reviewed_at: new Date(),
            rejection_reason: rejectionReason
        } : {})
    });
};

/**
 * Assign restaurant_owner role to user after successful onboarding
 */
export const assignRestaurantOwnerRole = async (userId: string): Promise<void> => {
    const hasRole = await userRepository.hasRole(userId, 'platform', 'restaurant_owner');
    
    if (!hasRole) {
        await userRepository.addRole(userId, {
            scope: 'platform',
            role: 'restaurant_owner',
            assignedAt: new Date()
        });
        
        const user = await userRepository.findById(userId);
        if (user && !user.preferred_role) {
            await userRepository.updatePreferredRole(userId, 'restaurant_owner');
        }
    }
};

/**
 * Complete onboarding process
 */
export const completeOnboarding = async (
    userId: string,
    brandId: string,
    outletId: string,
    menuStrategy: 'brand' | 'outlet',
    complianceId?: string | null
): Promise<{
    onboardingRequest: any;
    user: any;
}> => {
    // Create onboarding request
    const onboardingRequest = await createOnboardingRequest(
        userId,
        brandId,
        outletId,
        menuStrategy,
        complianceId
    );

    // Assign restaurant_owner role
    await assignRestaurantOwnerRole(userId);

    // Update user's current step and onboarding completion
    await userRepository.updateProfile(userId, { currentStep: 'DONE' } as any);

    // Update outlet approval status
    await outletRepository.updateById(outletId, {
        approval_status: 'PENDING',
        approval: { submitted_at: new Date() } as any
    });

    const user = await userRepository.findById(userId);

    return {
        onboardingRequest,
        user
    };
};

/**
 * Get pending onboarding requests (for admin)
 */
export const getPendingOnboardingRequests = async (): Promise<unknown[]> => {
    return await onboardingRequestRepo.findPendingRequests();
};

/**
 * Approve onboarding request
 */
export const approveOnboardingRequest = async (
    requestId: string,
    adminId: string
): Promise<unknown> => {
    const request = await updateOnboardingStatus(requestId, 'approved', adminId) as IOnboardingRequest;
    
    if (request) {
        // Update user's current step to DONE
        await userRepository.updateProfile(request.user_id.toString(), { currentStep: 'DONE' } as any);

        // Update outlet status to ACTIVE
        await outletRepository.updateById(request.outlet_id.toString(), {
            status: 'ACTIVE',
            approval_status: 'APPROVED',
            approval: { reviewed_by: adminId, reviewed_at: new Date() } as any
        } as any);

        // Update brand verification status
        await brandMemberRepository.updateBrandSettings(request.brand_id.toString(), {
            verification_status: 'verified',
            verified_by: adminId,
            verified_at: new Date(),
            is_public: true
        });
    }

    return request;
};

/**
 * Reject onboarding request
 */
export const rejectOnboardingRequest = async (
    requestId: string,
    adminId: string,
    reason: string
): Promise<unknown> => {
    const request = await updateOnboardingStatus(requestId, 'rejected', adminId, reason) as IOnboardingRequest;
    
    if (request) {
        // Update outlet status to REJECTED
        await outletRepository.updateById(request.outlet_id.toString(), {
            status: 'REJECTED',
            approval_status: 'REJECTED',
            approval: { reviewed_by: adminId, reviewed_at: new Date(), rejection_reason: reason } as any
        } as any);
    }

    return request;
};
