import { Outlet } from '../../models/Outlet.js';
import { Brand } from '../../models/Brand.js';
import { BrandUpdateRequest } from '../../models/BrandUpdateRequest.js';
import { User } from '../../models/User.js';

export const getDashboardCounts = async () => {
    const [pendingRequests, pendingBrands, brandUpdates, totalBrands, totalOutlets, totalUsers] = await Promise.all([
        Outlet.countDocuments({ approval_status: 'PENDING' }),
        Brand.countDocuments({ verification_status: 'pending' }),
        BrandUpdateRequest.countDocuments({ status: 'pending' }),
        Brand.countDocuments(),
        Outlet.countDocuments(),
        User.countDocuments(),
    ]);

    return {
        pendingRequests,
        pendingBrands,
        brandUpdates,
        totalBrands,
        totalOutlets,
        totalUsers,
    };
};
