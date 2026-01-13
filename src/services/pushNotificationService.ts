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

        if (allTokens.length === 0) {
            console.log(`FCM: No tokens found for any of the ${userIds.length} users. userIds: ${userIds.join(', ')}`);
            return;
        }

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

            console.log(`FCM: Attempting to send push to ${batch.length} tokens...`);
            const response = await admin.messaging().sendEachForMulticast(message);

            stats.success += response.successCount;
            stats.failure += response.failureCount;

            if (response.failureCount > 0) {
                console.warn(`FCM: ${response.failureCount} tokens failed in this batch.`);
                const tokensToRemove: string[] = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        const error = resp.error?.code;
                        const errorMsg = resp.error?.message;
                        console.error(`FCM: Token failure [${idx}]: ${error} - ${errorMsg}`);

                        if (error === 'messaging/invalid-registration-token' ||
                            error === 'messaging/registration-token-not-registered') {
                            tokensToRemove.push(batch[idx]);
                        }
                    } else {
                        console.log(`FCM: Token success [${idx}]`);
                    }
                });

                if (tokensToRemove.length > 0) {
                    console.log(`FCM: Removing ${tokensToRemove.length} stale/invalid tokens from DB.`);
                    await User.updateMany(
                        { fcm_tokens: { $in: tokensToRemove } },
                        { $pull: { fcm_tokens: { $in: tokensToRemove } } }
                    );
                }
            } else {
                console.log(`FCM: All ${batch.length} tokens in this batch were successfully accepted by Firebase.`);
            }
        }

        console.log(`FCM: Push summary -> Successes: ${stats.success}, Failures: ${stats.failure}`);
    } catch (error) {
        console.error('Error sending push notifications:', error);
    }
};
