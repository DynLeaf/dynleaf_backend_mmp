import { AppError } from '../../errors/AppError.js';
import * as onboardingRepo from '../../repositories/admin/adminOnboardingRepository.js';

export const listOnboardingRequests = async (page: number, limit: number, statusFilter?: string) => {
    const skip = (page - 1) * limit;
    const query: any = {};
    
    if (statusFilter && statusFilter !== 'all') {
        const statusMap: Record<string, string> = {
            'pending_approval': 'PENDING',
            'approved': 'APPROVED',
            'rejected': 'REJECTED'
        };
        if (statusMap[statusFilter]) {
            query.approval_status = statusMap[statusFilter];
        }
    }

    const { outlets, total } = await onboardingRepo.findOnboardingOutlets(query, skip, limit);

    const requests = outlets.map((outlet: any) => ({
        _id: outlet._id,
        user_id: outlet.created_by_user_id ? {
            _id: outlet.created_by_user_id._id,
            phone: outlet.created_by_user_id.phone,
            email: outlet.created_by_user_id.email,
            name: outlet.created_by_user_id.username,
        } : {},
        brand_id: outlet.brand_id ? {
            _id: outlet.brand_id._id,
            name: outlet.brand_id.name,
            logo: outlet.brand_id.logo_url,
        } : {},
        outlet_id: {
            _id: outlet._id,
            name: outlet.name,
            address: outlet.address ? {
                city: outlet.address.city,
                full: outlet.address.full,
            } : {},
        },
        status: outlet.approval_status === 'PENDING' ? 'pending_approval' : outlet.approval_status?.toLowerCase(),
        submitted_at: outlet.approval?.submitted_at || (outlet as any).createdAt,
        menu_strategy: 'standard',
        rejection_reason: outlet.approval?.rejection_reason,
    }));

    return {
        requests,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
};

export const getOnboardingRequestDetail = async (id: string) => {
    const outlet = await onboardingRepo.findOnboardingOutletById(id);
    if (!outlet) {
        throw new AppError('Outlet not found', 404);
    }

    const compliance = await onboardingRepo.findComplianceByOutletId(id);
    const userDoc = outlet.created_by_user_id as any;
    const brandDoc = outlet.brand_id as any;

    return {
        _id: outlet._id,
        user_id: userDoc ? {
            _id: userDoc._id,
            phone: userDoc.phone,
            email: userDoc.email,
            name: userDoc.username,
        } : {},
        brand_id: brandDoc ? {
            _id: brandDoc._id,
            name: brandDoc.name,
            logo: brandDoc.logo_url,
            description: brandDoc.description,
            cuisine_types: brandDoc.cuisines,
            verification_status: brandDoc.verification_status,
        } : {},
        outlet_id: {
            _id: outlet._id,
            name: outlet.name,
            address: outlet.address,
            contact: outlet.contact,
            approval_status: outlet.approval_status,
            status: outlet.status,
        },
        compliance: compliance ? {
            _id: compliance._id,
            fssai_number: compliance.fssai_number,
            gst_number: compliance.gst_number,
            gst_percentage: compliance.gst_percentage,
            is_verified: compliance.is_verified,
            verified_at: compliance.verified_at,
        } : null,
        status: outlet.approval_status === 'PENDING' ? 'pending_approval' : outlet.approval_status?.toLowerCase(),
        submitted_at: outlet.approval?.submitted_at || (outlet as any).created_at,
        menu_strategy: 'standard',
        rejection_reason: outlet.approval?.rejection_reason,
        approved_at: outlet.approval?.reviewed_at && outlet.approval_status === 'APPROVED' ? outlet.approval.reviewed_at : undefined,
        rejected_at: outlet.approval?.reviewed_at && outlet.approval_status === 'REJECTED' ? outlet.approval.reviewed_at : undefined,
    };
};

export const approveOnboardingRequest = async (id: string, reviewerId: string) => {
    const outlet = await onboardingRepo.updateOutletApprovalStatus(id, 'ACTIVE', 'APPROVED', reviewerId);
    if (!outlet) {
        throw new AppError('Outlet not found', 404);
    }
    return outlet;
};

export const rejectOnboardingRequest = async (id: string, reviewerId: string, reason: string) => {
    if (!reason || !reason.trim()) {
        throw new AppError('Rejection reason is required', 400);
    }
    const outlet = await onboardingRepo.updateOutletApprovalStatus(id, 'REJECTED', 'REJECTED', reviewerId, reason);
    if (!outlet) {
        throw new AppError('Outlet not found', 404);
    }
    return outlet;
};
