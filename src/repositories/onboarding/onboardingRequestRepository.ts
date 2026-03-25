import { OnboardingRequest } from '../../models/OnboardingRequest.js';
import mongoose from 'mongoose';

export const createRequest = async (data: {
    user_id: string;
    brand_id: string;
    outlet_id: string;
    menu_strategy: 'brand' | 'outlet';
    status: string;
    submitted_at: Date;
    compliance_id?: mongoose.Types.ObjectId;
}) => {
    return await OnboardingRequest.create(data);
};

export const findByUserId = async (userId: string) => {
    return await OnboardingRequest.findOne({ user_id: userId })
        .populate('brand_id')
        .populate('outlet_id')
        .sort({ created_at: -1 });
};

export const findById = async (requestId: string) => {
    return await OnboardingRequest.findById(requestId);
};

export const findPendingRequests = async () => {
    return await OnboardingRequest.find({ status: 'pending_approval' })
        .populate('user_id')
        .populate('brand_id')
        .populate('outlet_id')
        .sort({ submitted_at: -1 });
};
export const updateStatus = async (requestId: string, statusData: any) => {
    return await OnboardingRequest.findByIdAndUpdate(requestId, statusData, { new: true });
};
