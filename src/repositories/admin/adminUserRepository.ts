import mongoose from 'mongoose';
import { User } from '../../models/User.js';
import { Brand } from '../../models/Brand.js';
import { Outlet } from '../../models/Outlet.js';
import { Subscription } from '../../models/Subscription.js';
import { staffUserRepository } from '../../modules/staff/repositories/staffUser.repository.js';
import { adminDashboardService } from '../../modules/staff/services/dashboard.service.js';

export const findUsers = async (query: Record<string, unknown>, skip: number, limit: number) => {
    const [users, total] = await Promise.all([
        User.find(query)
            .select('-password')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        User.countDocuments(query),
    ]);
    return { users, total };
};

export const findUserById = async (id: string) => {
    return await User.findById(id).select('-password_hash').lean();
};

export const findUserAssets = async (id: string) => {
    const [ownedBrands, ownedOutlets, managedOutletsByManagerField] = await Promise.all([
        Brand.find({ admin_user_id: id })
            .select('name slug verification_status is_active is_featured created_at')
            .sort({ created_at: -1 })
            .lean(),
        Outlet.find({ created_by_user_id: id })
            .populate('brand_id', 'name')
            .select('name slug status approval_status created_at brand_id')
            .sort({ created_at: -1 })
            .lean(),
        Outlet.find({ 'managers.user_id': id })
            .populate('brand_id', 'name')
            .select('name slug status approval_status created_at brand_id managers')
            .sort({ created_at: -1 })
            .lean(),
    ]);

    return { ownedBrands, ownedOutlets, managedOutletsByManagerField };
};

export const findOutletsByIds = async (ids: string[]) => {
    return await Outlet.find({ _id: { $in: ids } })
        .populate('brand_id', 'name')
        .select('name slug status approval_status created_at brand_id')
        .sort({ created_at: -1 })
        .lean();
};

export const findSubscriptionsByOutletIds = async (ids: string[]) => {
    return await Subscription.find({ outlet_id: { $in: ids } })
        .select('outlet_id plan status end_date trial_ends_at payment_status')
        .lean();
};

export const toggleUserBlockStatus = async (id: string, block: boolean, adminId?: string) => {
    const updatePayload: any = block
        ? { is_active: false, is_suspended: true, suspended_at: new Date(), suspended_by: adminId }
        : { is_active: true, is_suspended: false, $unset: { suspended_at: 1, suspended_by: 1 } };
        
    return await User.findByIdAndUpdate(id, updatePayload, { new: true }).select('-password_hash').lean();
};

// Staff delegation
export const StaffDashboardService = adminDashboardService;
export const StaffUserRepo = staffUserRepository;
