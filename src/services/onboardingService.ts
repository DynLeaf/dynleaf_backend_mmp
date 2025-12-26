import { OnboardingRequest, IOnboardingRequest } from '../models/OnboardingRequest.js';
import { User } from '../models/User.js';
import { Brand } from '../models/Brand.js';
import { Outlet } from '../models/Outlet.js';
import mongoose from 'mongoose';

/**
 * Create onboarding request
 */
export const createOnboardingRequest = async (
    userId: string,
    brandId: string,
    outletId: string,
    menuStrategy: 'brand' | 'outlet',
    complianceId?: string | null
): Promise<IOnboardingRequest> => {
    const onboardingRequest = new OnboardingRequest({
        user_id: userId,
        brand_id: brandId,
        outlet_id: outletId,
        menu_strategy: menuStrategy,
        status: 'pending_approval',
        submitted_at: new Date(),
        compliance_id: complianceId ? new mongoose.Types.ObjectId(complianceId) : undefined
    });

    await onboardingRequest.save();
    return onboardingRequest;
};

/**
 * Get user's onboarding request
 */
export const getUserOnboardingRequest = async (userId: string): Promise<IOnboardingRequest | null> => {
    return await OnboardingRequest.findOne({ user_id: userId })
        .populate('brand_id')
        .populate('outlet_id')
        .sort({ created_at: -1 });
};

/**
 * Update onboarding status
 */
export const updateOnboardingStatus = async (
    requestId: string,
    status: 'pending_details' | 'pending_approval' | 'approved' | 'rejected',
    reviewedBy?: string,
    rejectionReason?: string
): Promise<IOnboardingRequest | null> => {
    const request = await OnboardingRequest.findById(requestId);
    
    if (!request) {
        throw new Error('Onboarding request not found');
    }

    request.status = status;
    
    if (status === 'approved' || status === 'rejected') {
        request.reviewed_by = reviewedBy ? new mongoose.Types.ObjectId(reviewedBy) : undefined;
        request.reviewed_at = new Date();
        request.rejection_reason = rejectionReason;
    }

    await request.save();
    return request;
};

/**
 * Assign restaurant_owner role to user after successful onboarding
 */
export const assignRestaurantOwnerRole = async (userId: string): Promise<void> => {
    const user = await User.findById(userId);
    
    if (!user) {
        throw new Error('User not found');
    }

    // Check if user already has restaurant_owner role
    const hasRole = user.roles.some(r => r.role === 'restaurant_owner');
    
    if (!hasRole) {
        user.roles.push({
            scope: 'platform',
            role: 'restaurant_owner',
            assignedAt: new Date()
        });
        
        // Set as active role if no active role set
        if (!user.preferred_role) {
            user.preferred_role = 'restaurant_owner';
        }
        
        await user.save();
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
    onboardingRequest: IOnboardingRequest;
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
    const user = await User.findById(userId);
    if (user) {
        user.currentStep = 'DONE';
        user.onboarding_completed_at = new Date();
        await user.save();
    }

    // Update outlet approval status
    await Outlet.findByIdAndUpdate(outletId, {
        approval_status: 'PENDING',
        'approval.submitted_at': new Date()
    });

    return {
        onboardingRequest,
        user
    };
};

/**
 * Get pending onboarding requests (for admin)
 */
export const getPendingOnboardingRequests = async (): Promise<IOnboardingRequest[]> => {
    return await OnboardingRequest.find({ status: 'pending_approval' })
        .populate('user_id')
        .populate('brand_id')
        .populate('outlet_id')
        .sort({ submitted_at: -1 });
};

/**
 * Approve onboarding request
 */
export const approveOnboardingRequest = async (
    requestId: string,
    adminId: string
): Promise<IOnboardingRequest | null> => {
    const request = await updateOnboardingStatus(requestId, 'approved', adminId);
    
    if (request) {
        // Update user's current step to DONE
        await User.findByIdAndUpdate(request.user_id, {
            currentStep: 'DONE'
        });

        // Update outlet status to ACTIVE
        await Outlet.findByIdAndUpdate(request.outlet_id, {
            status: 'ACTIVE',
            approval_status: 'APPROVED',
            'approval.reviewed_by': adminId,
            'approval.reviewed_at': new Date()
        });

        // Update brand verification status
        await Brand.findByIdAndUpdate(request.brand_id, {
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
): Promise<IOnboardingRequest | null> => {
    const request = await updateOnboardingStatus(requestId, 'rejected', adminId, reason);
    
    if (request) {
        // Update outlet status to REJECTED
        await Outlet.findByIdAndUpdate(request.outlet_id, {
            status: 'REJECTED',
            approval_status: 'REJECTED',
            'approval.reviewed_by': adminId,
            'approval.reviewed_at': new Date(),
            'approval.rejection_reason': reason
        });
    }

    return request;
};
