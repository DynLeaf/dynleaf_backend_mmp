import admin from '../config/firebaseAdmin.js';
import { User } from '../models/User.js';

export const sendPushNotificationToUsers = async (
    userIds: string[],
    title: string,
    body: string,
    data: Record<string, string> = {}
) => {
    try {
        // Find all users and their tokens
        const users = await User.find({ _id: { $in: userIds } }).select('fcm_tokens');
        const allTokens = users.flatMap(user => user.fcm_tokens || []);

        if (allTokens.length === 0) return;

        // Batch send (FCM supports up to 500 tokens per call)
        const batches = [];
        for (let i = 0; i < allTokens.length; i += 500) {
            batches.push(allTokens.slice(i, i + 500));
        }

        const stats = { success: 0, failure: 0 };

        for (const batch of batches) {
            const message = {
                notification: { title, body },
                data: data,
                tokens: batch,
            };

            const response = await admin.messaging().sendEachForMulticast(message);
            stats.success += response.successCount;
            stats.failure += response.failureCount;

            // Handle invalid tokens (cleanup)
            if (response.failureCount > 0) {
                const tokensToRemove: string[] = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        const error = resp.error?.code;
                        if (error === 'messaging/invalid-registration-token' ||
                            error === 'messaging/registration-token-not-registered') {
                            tokensToRemove.push(batch[idx]);
                        }
                    }
                });

                if (tokensToRemove.length > 0) {
                    await User.updateMany(
                        { fcm_tokens: { $in: tokensToRemove } },
                        { $pull: { fcm_tokens: { $in: tokensToRemove } } }
                    );
                }
            }
        }

        console.log(`Push stats: ${stats.success} successes, ${stats.failure} failures`);
    } catch (error) {
        console.error('Error sending push notifications:', error);
    }
};
