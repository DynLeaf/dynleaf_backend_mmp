import mongoose from 'mongoose';
import { AppError } from '../../errors/AppError.js';
import * as userRepo from '../../repositories/admin/adminUserRepository.js';
import { normalizePlanToTier, hasFeature, SUBSCRIPTION_FEATURES } from '../../config/subscriptionPlans.js';

export const listUsers = async (page: number, limit: number, search?: string) => {
    const skip = (page - 1) * limit;
    const query = search ? {
        $or: [
            { phone: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { username: { $regex: search, $options: 'i' } },
        ],
    } : {};
    
    const { users, total } = await userRepo.findUsers(query, skip, limit);
    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getUserDetail = async (id: string) => {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid user id', 400);

    const user = await userRepo.findUserById(id);
    if (!user) throw new AppError('User not found', 404);

    const { ownedBrands, ownedOutlets, managedOutletsByManagerField } = await userRepo.findUserAssets(id);

    const roleOutletIds = (user as any)?.roles
        ?.filter((r: any) => r?.scope === 'outlet' && (r?.role === 'manager' || r?.role === 'staff') && r?.outletId)
        ?.map((r: any) => String(r.outletId))
        ?.filter(Boolean);

    const roleOutletIdSet = new Set<string>(roleOutletIds || []);
    const managersOutletIdSet = new Set<string>(managedOutletsByManagerField.map((o: any) => String(o._id)));

    const missingRoleOutletIds = [...roleOutletIdSet].filter((oid) => !managersOutletIdSet.has(oid));

    const managedOutletsByRole = missingRoleOutletIds.length
        ? await userRepo.findOutletsByIds(missingRoleOutletIds)
        : [];

    const managedMap = new Map<string, any>();
    for (const o of managedOutletsByManagerField) managedMap.set(String(o._id), o);
    for (const o of managedOutletsByRole as any[]) managedMap.set(String(o._id), o);
    const managedOutlets = [...managedMap.values()];

    const allOutletIds = Array.from(new Set<string>([...ownedOutlets, ...managedOutlets].map((o: any) => String(o._id))));

    const subscriptions = allOutletIds.length ? await userRepo.findSubscriptionsByOutletIds(allOutletIds) : [];

    const subByOutletId = new Map<string, any>();
    for (const s of subscriptions as any[]) {
        subByOutletId.set(String(s.outlet_id), s);
    }

    const toOutletWithSubscription = (outlet: any) => {
        const sub = subByOutletId.get(String(outlet._id));
        const tier = normalizePlanToTier(sub?.plan);
        const status = sub?.status || 'inactive';
        const isActive = status === 'active' || status === 'trial';
        const entitlements = {
            analytics: tier === 'premium' && isActive && hasFeature(sub?.plan || 'free', SUBSCRIPTION_FEATURES.ADVANCED_ANALYTICS),
            offers: tier === 'premium' && isActive && hasFeature(sub?.plan || 'free', SUBSCRIPTION_FEATURES.OFFER_MANAGEMENT)
        };

        return {
            ...outlet,
            subscription_summary: {
                tier, status,
                end_date: sub?.end_date ?? null,
                trial_ends_at: sub?.trial_ends_at ?? null,
                payment_status: sub?.payment_status ?? 'pending',
                entitlements
            }
        };
    };

    return {
        user,
        ownedBrands,
        ownedOutlets: ownedOutlets.map(toOutletWithSubscription),
        managedOutlets: managedOutlets.map(toOutletWithSubscription),
    };
};

export const blockUser = async (id: string, adminId: string) => {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid user id', 400);
    const user = await userRepo.findUserById(id);
    if (!user) throw new AppError('User not found', 404);
    if ((user as any).is_suspended && !(user as any).is_active) throw new AppError('User is already blocked', 400);

    return await userRepo.toggleUserBlockStatus(id, true, adminId);
};

export const unblockUser = async (id: string) => {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid user id', 400);
    const user = await userRepo.findUserById(id);
    if (!user) throw new AppError('User not found', 404);
    if ((user as any).is_active && !(user as any).is_suspended) throw new AppError('User is already active', 400);

    return await userRepo.toggleUserBlockStatus(id, false);
};

// Staff logic
import { staffUserService } from '../../modules/staff/services/staffUser.service.js';

export const getSalesTracking = async () => userRepo.StaffDashboardService.getSalesTracking();
export const getCrafterTracking = async () => userRepo.StaffDashboardService.getCrafterTracking();
export const listStaffUsers = async (role?: string, status?: string) => staffUserService.getAll({ role: role as any, status: status as any });

export const createStaffUser = async (data: any) => {
    const { name, email, password, role } = data;
    if (!name || !email || !password || !role) throw new AppError('name, email, password and role are required', 400);
    if (!['salesman', 'crafter', 'admin'].includes(role)) throw new AppError('Invalid role', 400);
    
    const existing = await userRepo.StaffUserRepo.findByEmail(email);
    if (existing) throw new AppError('Email already in use', 400);

    return await userRepo.StaffUserRepo.create({ name, email, password, role });
};

export const blockStaffUser = async (id: string) => {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid user id', 400);
    const user = await userRepo.StaffUserRepo.findById(id);
    if (!user) throw new AppError('Staff user not found', 404);
    if (user.status === 'blocked') throw new AppError('User is already blocked', 400);
    return await userRepo.StaffUserRepo.updateStatus(id, 'blocked');
};

export const unblockStaffUser = async (id: string) => {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid user id', 400);
    const user = await userRepo.StaffUserRepo.findById(id);
    if (!user) throw new AppError('Staff user not found', 404);
    if (user.status === 'active') throw new AppError('User is already active', 400);
    return await userRepo.StaffUserRepo.updateStatus(id, 'active');
};
