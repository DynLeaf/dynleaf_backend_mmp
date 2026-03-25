import { User } from '../models/User.js';
import mongoose from 'mongoose';

export const findFcmTokensByUserIds = async (userIds: string[]) => {
    const objectIds = userIds.map(id => new mongoose.Types.ObjectId(id));
    return await User.find({ _id: { $in: objectIds } })
        .select('_id username email phone fcm_tokens')
        .lean();
};

export const findAllUserIds = async () => {
    const users = await User.find().select('_id');
    return users.map(u => u._id.toString());
};

export const findUserIdsByRoles = async (roles: string[]) => {
    const users = await User.find({ 'roles.role': { $in: roles } }).select('_id');
    return users.map(u => u._id.toString());
};

export const findByUsernameOrEmail = async (identifier: string) => {
    return await User.findOne({
        $or: [{ username: identifier }, { email: identifier }]
    }).select('_id').lean();
};

export const addFcmToken = async (userId: string, token: string) => {
    return await User.findByIdAndUpdate(userId, {
        $addToSet: { fcm_tokens: token }
    });
};

export const removeStaleFcmTokens = async (tokens: string[]) => {
    if (tokens.length === 0) return;
    await User.updateMany(
        { fcm_tokens: { $in: tokens } },
        { $pull: { fcm_tokens: { $in: tokens } } }
    );
};

export const findUserById = async (userId: string) => {
    return await User.findById(userId).select('role').lean();
};

export const findUserByIdFull = async (userId: string) => {
    return await User.findById(userId).lean();
};
