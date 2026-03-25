import { Outlet } from '../../models/Outlet.js';
import { Compliance } from '../../models/Compliance.js';

export const findOnboardingOutlets = async (query: Record<string, unknown>, skip: number, limit: number) => {
    const [outlets, total] = await Promise.all([
        Outlet.find(query)
            .populate('brand_id', 'name logo_url')
            .populate('created_by_user_id', 'phone email username')
            .select('name slug address contact approval_status approval.submitted_at approval.rejection_reason createdAt')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Outlet.countDocuments(query),
    ]);
    return { outlets, total };
};

export const findOnboardingOutletById = async (id: string) => {
    return await Outlet.findById(id)
        .populate('brand_id', 'name logo_url description cuisines verification_status')
        .populate('created_by_user_id', 'phone email username')
        .lean();
};

export const findComplianceByOutletId = async (outletId: string) => {
    return await Compliance.findOne({ outlet_id: outletId }).lean();
};

export const updateOutletApprovalStatus = async (
    id: string,
    status: string,
    approvalStatus: string,
    reviewerId: string,
    reason?: string
) => {
    const updatePayload: any = {
        approval_status: approvalStatus,
        status: status,
        'approval.reviewed_at': new Date(),
        'approval.reviewed_by': reviewerId
    };

    if (reason) {
        updatePayload['approval.rejection_reason'] = reason;
    }

    return await Outlet.findByIdAndUpdate(id, updatePayload, { new: true }).lean();
};
