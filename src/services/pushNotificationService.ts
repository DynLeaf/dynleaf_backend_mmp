import * as fcmClient from '../integrations/fcm/fcmClient.js';
import * as deviceTokenRepo from '../repositories/deviceTokenRepository.js';

/**
 * Send push notifications to a list of user IDs via FCM.
 * Handles token resolution, batching, and stale token cleanup.
 */
export const sendToUsers = async (
    userIds: string[],
    title: string,
    body: string,
    link: string,
    image?: string,
    notificationId?: string,
    brandLogo?: string
) => {
    const users = await deviceTokenRepo.findFcmTokensByUserIds(userIds);
    const allTokens = users.flatMap(
        (user) => (user as unknown as Record<string, unknown>).fcm_tokens as string[] || []
    );

    if (allTokens.length === 0) {
        return { success: 0, failure: 0 };
    }

    const data: Record<string, string> = {
        notification_id: notificationId || '',
        title,
        body,
        image: '',
        link,
        icon: brandLogo || '',
    };

    if (image && image.trim().length > 0) data.image = image;
    if (brandLogo && brandLogo.trim().length > 0) data.icon = brandLogo;

    const result = await fcmClient.sendMulticast(allTokens, data);

    // Clean up stale tokens
    if (result.staleTokens.length > 0) {
        await deviceTokenRepo.removeStaleFcmTokens(result.staleTokens);
    }

    return { success: result.success, failure: result.failure };
};
