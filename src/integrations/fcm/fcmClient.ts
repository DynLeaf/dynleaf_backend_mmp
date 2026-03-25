import admin from '../../config/firebaseAdmin.js';

interface FcmSendResult {
    success: number;
    failure: number;
    staleTokens: string[];
}

/**
 * Send multicast push notification via Firebase Cloud Messaging.
 * Batches tokens in groups of 500 (FCM limit).
 */
export const sendMulticast = async (
    tokens: string[],
    data: Record<string, string>
): Promise<FcmSendResult> => {
    if (tokens.length === 0) return { success: 0, failure: 0, staleTokens: [] };

    const batches: string[][] = [];
    for (let i = 0; i < tokens.length; i += 500) {
        batches.push(tokens.slice(i, i + 500));
    }

    const stats: FcmSendResult = { success: 0, failure: 0, staleTokens: [] };

    for (const batch of batches) {
        const message = { data, tokens: batch };
        const response = await admin.messaging().sendEachForMulticast(message);

        stats.success += response.successCount;
        stats.failure += response.failureCount;

        if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errorCode = resp.error?.code;
                    if (
                        errorCode === 'messaging/invalid-registration-token' ||
                        errorCode === 'messaging/registration-token-not-registered'
                    ) {
                        stats.staleTokens.push(batch[idx]);
                    }
                }
            });
        }
    }

    return stats;
};
