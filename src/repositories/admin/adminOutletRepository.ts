import mongoose from 'mongoose';
import { Outlet } from '../../models/Outlet.js';
import { User } from '../../models/User.js';
import { Compliance } from '../../models/Compliance.js';
import { Menu } from '../../models/Menu.js';
// Admin delete uses existing shared controllers for now, but referenced here.

export const findOutlets = async (query: Record<string, unknown>, skip: number, limit: number) => {
    const [outlets, total] = await Promise.all([
        Outlet.find(query)
            .populate('brand_id', 'name')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Outlet.countDocuments(query),
    ]);
    return { outlets, total };
};

export const findOutletDetailsById = async (id: string) => {
    return await Outlet.findById(id)
        .populate('brand_id', 'name logo description cuisine_types verification_status')
        .populate('created_by_user_id', 'name email phone full_name username')
        .lean();
};

export const findComplianceByOutletId = async (id: string) => {
    return await Compliance.findOne({ outlet_id: id }).lean();
};

export const findMenusWithCountsByOutletId = async (id: string) => {
    const menus = await Menu.find({ outlet_id: id }).select('name description is_active').lean();
    return await Promise.all(
        menus.map(async (menu: any) => {
            const itemsCount = await Menu.aggregate([
                { $match: { _id: menu._id } },
                { $unwind: '$categories' },
                { $unwind: '$categories.items' },
                { $count: 'total' }
            ]);
            return {
                ...menu,
                items_count: itemsCount[0]?.total || 0
            };
        })
    );
};

export const updateOutletStatus = async (id: string, status: string) => {
    return await Outlet.findByIdAndUpdate(id, { status }, { new: true }).lean();
};

export const updateOutletOwner = async (id: string, newOwnerId: string, previousOwnerId?: string, adminId?: string) => {
    const outlet = await Outlet.findById(id).populate('created_by_user_id');
    if (!outlet) return null;

    outlet.created_by_user_id = new mongoose.Types.ObjectId(newOwnerId) as any;
    await outlet.save();

    if (previousOwnerId) {
        await User.findByIdAndUpdate(previousOwnerId, {
            $pull: { roles: { scope: 'outlet', outletId: new mongoose.Types.ObjectId(id) } }
        });
    }

    const newOwner = await User.findById(newOwnerId);
    if (newOwner) {
        const hasRole = newOwner.roles.some(
            (r: any) => r.scope === 'outlet' && r.outletId?.toString() === id
        );
        if (!hasRole) {
            await User.findByIdAndUpdate(newOwnerId, {
                $push: {
                    roles: {
                        scope: 'outlet',
                        role: 'manager',
                        outletId: new mongoose.Types.ObjectId(id),
                        assignedAt: new Date(),
                        assignedBy: adminId ? new mongoose.Types.ObjectId(adminId) : undefined
                    }
                }
            });
        }
    }

    return await Outlet.findById(id).populate('created_by_user_id', 'name email phone full_name username').lean();
};

export const findComplianceById = async (id: string) => await Compliance.findById(id);

export const updateComplianceVerification = async (id: string, isVerified: boolean, adminId?: string) => {
    return await Compliance.findByIdAndUpdate(
        id,
        {
            is_verified: isVerified,
            verified_at: isVerified ? new Date() : undefined,
            verified_by: isVerified ? adminId : undefined
        },
        { new: true }
    ).lean();
};

export const updateComplianceData = async (id: string, data: any) => {
    return await Compliance.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
};
