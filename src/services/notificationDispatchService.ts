import * as deviceTokenRepo from '../repositories/deviceTokenRepository.js';
import * as pushNotifRepo from '../repositories/pushNotificationRepository.js';
import { AppError, ErrorCode } from '../errors/AppError.js';

interface TargetAudience {
    type: string;
    user_ids?: string[];
    roles?: string[];
}

/**
 * Resolve target user IDs from a notification's audience targeting.
 */
export const resolveTargetUserIds = async (audience: TargetAudience): Promise<string[]> => {
    if (audience.type === 'all_users') {
        return await deviceTokenRepo.findAllUserIds();
    }
    if (audience.type === 'selected_users') {
        return (audience.user_ids || []).map(id => String(id));
    }
    if (audience.type === 'user_role') {
        return await deviceTokenRepo.findUserIdsByRoles(audience.roles || []);
    }
    return [];
};

/**
 * Get users with and without FCM tokens for dispatching.
 */
export const resolveTokenUsers = async (userIds: string[]) => {
    const users = await deviceTokenRepo.findFcmTokensByUserIds(userIds);
    const usersWithTokens = users.filter(
        (u) => {
            const tokens = (u as unknown as Record<string, unknown>).fcm_tokens as string[] | undefined;
            return tokens && tokens.length > 0;
        }
    );
    const usersWithoutTokens = users.filter(
        (u) => {
            const tokens = (u as unknown as Record<string, unknown>).fcm_tokens as string[] | undefined;
            return !tokens || tokens.length === 0;
        }
    );
    return { usersWithTokens, usersWithoutTokens, allUsers: users };
};

/**
 * Resolve a user ID from a potentially non-ObjectId string (username/email).
 */
export const resolveUserId = async (rawId: string): Promise<string | null> => {
    const { default: mongoose } = await import('mongoose');
    if (mongoose.Types.ObjectId.isValid(rawId)) return rawId;

    const user = await deviceTokenRepo.findByUsernameOrEmail(rawId);
    return user ? String((user as unknown as Record<string, unknown>)._id) : null;
};

/**
 * Register a device FCM token for a user.
 */
export const registerPushToken = async (userId: string, token: string) => {
    if (!token) throw new AppError('Token is required', 400, ErrorCode.VALIDATION_ERROR);
    await deviceTokenRepo.addFcmToken(userId, token);
};
