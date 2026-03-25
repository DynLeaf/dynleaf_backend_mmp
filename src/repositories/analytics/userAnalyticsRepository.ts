import { User } from '../../models/User.js';

export const getUserAnalyticsForWindow = async (start: Date, end: Date) => {
    const [newUsers, activeUsers] = await Promise.all([
        User.countDocuments({ created_at: { $gte: start, $lte: end } }),
        User.countDocuments({ last_active_at: { $gte: start, $lte: end } }),
    ]);

    return {
        newUsers,
        activeUsers,
        returningUsers: Math.max(0, activeUsers - newUsers),
    };
};
