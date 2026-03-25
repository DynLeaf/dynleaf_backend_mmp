import * as dashboardRepo from '../../repositories/admin/adminDashboardRepository.js';

export const getDashboardStats = async () => {
    return await dashboardRepo.getDashboardCounts();
};
