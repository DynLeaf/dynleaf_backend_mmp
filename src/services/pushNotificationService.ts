import admin from "../config/firebaseAdmin.js";
import { User } from "../models/User.js";
import {
  PushNotification,
  TargetAudienceType,
  DeliveryStatus,
} from "../models/PushNotification.js";
import mongoose from "mongoose";

/**
 * Send push notification to specific users
 * Used by the legacy notification system
 * 
 * Payload format:
 * {
 *   data: {
 *     notification_id: string,
 *     title: string,
 *     body: string,
 *     brandLogo: string,
 *     image?: string (optional, for ads/brands),
 *     link?: string,
 *     ...otherData
 *   }
 * }
 */
export const sendPushNotificationToUsers = async (
  userIds: string[],
  title: string,
  body: string,
  link: string,
  image?: string,
  notificationId?: string,
  brandLogo?: string
) => {
  try {
    // Convert string IDs to ObjectId
    const objectIds = userIds.map((id) => new mongoose.Types.ObjectId(id));
    
    // Find all users and their tokens
    const users = await User.find({ _id: { $in: objectIds } }).select(
      "fcm_tokens"
    );
    const allTokens = users.flatMap((user) => user.fcm_tokens || []);

    if (allTokens.length === 0) {
      console.log(
        `FCM: No tokens found for any of the ${
          userIds.length
        } users. userIds: ${userIds.join(", ")}`
      );
      return { success: 0, failure: 0 };
    }

    // Batch send (FCM supports up to 500 tokens per call)
    const batches = [];
    for (let i = 0; i < allTokens.length; i += 500) {
      batches.push(allTokens.slice(i, i + 500));
    }

    const stats = { success: 0, failure: 0 };

    for (const batch of batches) {
      // Build the data payload with all required fields
      let messageData: Record<string, string> = {
        notification_id: notificationId || '',
        title,
        body,
        image: '',
        link,
        icon: brandLogo || '',
      };

      // Only include image if provided and not empty
      if (image && typeof image === 'string' && image.trim().length > 0) {
        messageData.image = image;
      }

      // Only include brandLogo if provided and not empty (use frontend default if not provided)
      if (brandLogo && typeof brandLogo === 'string' && brandLogo.trim().length > 0) {
        messageData.icon = brandLogo;
      }

      const message = {
        data: messageData,
        tokens: batch,
      };

      console.log(`FCM: Attempting to send push to ${batch.length} tokens...`);
      const response = await admin.messaging().sendEachForMulticast(message);

      stats.success += response.successCount;
      stats.failure += response.failureCount;

      if (response.failureCount > 0) {
        console.warn(
          `FCM: ${response.failureCount} tokens failed in this batch.`
        );
        const tokensToRemove: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const error = resp.error?.code;
            const errorMsg = resp.error?.message;
            console.error(
              `FCM: Token failure [${idx}]: ${error} - ${errorMsg}`
            );

            if (
              error === "messaging/invalid-registration-token" ||
              error === "messaging/registration-token-not-registered"
            ) {
              tokensToRemove.push(batch[idx]);
            }
          } else {
            console.log(`FCM: Token success [${idx}]`);
          }
        });

        if (tokensToRemove.length > 0) {
          console.log(
            `FCM: Removing ${tokensToRemove.length} stale/invalid tokens from DB.`
          );
          await User.updateMany(
            { fcm_tokens: { $in: tokensToRemove } },
            { $pull: { fcm_tokens: { $in: tokensToRemove } } }
          );
        }
      } else {
        console.log(
          `FCM: All ${batch.length} tokens in this batch were successfully accepted by Firebase.`
        );
      }
    }

    console.log(
      `FCM: Push summary -> Successes: ${stats.success}, Failures: ${stats.failure}`
    );
    return { success: stats.success, failure: stats.failure };
  } catch (error) {
    console.error("Error sending push notifications:", error);
    throw error;
  }
};

/**
 * Send push notification via FCM based on PushNotification document
 * Handles different targeting strategies
 */
export const sendPushNotificationCampaign = async (
  notificationId: string | mongoose.Types.ObjectId
) => {
  try {
    const notification = await PushNotification.findById(notificationId);

    if (!notification) {
      throw new Error("Push notification not found");
    }

    if (notification.status === DeliveryStatus.SENT) {
      console.log(`Notification ${notificationId} already sent, skipping`);
      return { success: 0, failure: 0 };
    }

    // Determine target users based on audience type
    let targetUserIds: string[] = [];

    if (notification.target_audience.type === TargetAudienceType.ALL_USERS) {
      // Get all user IDs
      const users = await User.find().select("_id");
      targetUserIds = users.map((u) => u._id.toString());
    } else if (
      notification.target_audience.type === TargetAudienceType.SELECTED_USERS
    ) {
      // Use pre-selected user IDs
      targetUserIds = (notification.target_audience.user_ids || []).map((id) =>
        id.toString()
      );
    } else if (
      notification.target_audience.type === TargetAudienceType.USER_ROLE
    ) {
      // Get users with specific roles
      const roles = notification.target_audience.roles || [];
      const users = await User.find({
        "roles.role": { $in: roles },
      }).select("_id");
      targetUserIds = users.map((u) => u._id.toString());
    }

    if (targetUserIds.length === 0) {
      console.log(`No target users found for notification ${notificationId}`);
      notification.status = DeliveryStatus.FAILED;
      notification.retry_policy.failed_delivery_reason = [
        "No target users found",
      ];
      await notification.save();
      return { success: 0, failure: 0 };
    }

    // Prepare data payload in the new format
    // Convert all custom_data values to strings to satisfy Record<string, string> type
    const customDataStringified: Record<string, string> = {};
    if (notification.content.custom_data) {
      for (const [key, value] of Object.entries(notification.content.custom_data)) {
        customDataStringified[key] = typeof value === 'string' ? value : JSON.stringify(value);
      }
    }

    const dataPayload: Record<string, string> = {
      notification_id: notificationId.toString(),
      notification_type: notification.notification_type,
      ...customDataStringified,
    };
    const link = (process.env.FRONTEND_URL || "https://www.dynleaf.com").toString();;

    // Send via FCM
    const result = await sendPushNotificationToUsers(
      targetUserIds,
      notification.content.title,
      notification.content.description,
      link,
      notification.content.image_url,
      notificationId.toString(),
      undefined
    );

    // Update notification with delivery results
    notification.delivery_metrics.sent = result.success;
    notification.delivery_metrics.failed = result.failure;
    notification.delivery_metrics.pending = 0;
    notification.status =
      result.failure === 0
        ? DeliveryStatus.SENT
        : DeliveryStatus.PARTIALLY_SENT;
    notification.sent_at = new Date();

    if (result.failure > 0) {
      notification.retry_policy.failed_delivery_reason?.push(
        `${result.failure} tokens failed to receive notification`
      );
    }

    await notification.save();

    return result;
  } catch (error: any) {
    console.error(
      `Error sending push notification campaign ${notificationId}:`,
      error
    );

    // Update notification status to failed
    try {
      await PushNotification.findByIdAndUpdate(notificationId, {
        status: DeliveryStatus.FAILED,
        $push: {
          "retry_policy.failed_delivery_reason": error.message,
        },
      });
    } catch (updateError) {
      console.error("Failed to update notification status:", updateError);
    }

    throw error;
  }
};

/**
 * Schedule a push notification for later sending
 * Should be called by a cron job or task scheduler
 */
export const processScheduledNotifications = async () => {
  try {
    const now = new Date();

    // Find all scheduled notifications that should be sent
    const scheduledNotifications = await PushNotification.find({
      status: { $in: [DeliveryStatus.SCHEDULED, DeliveryStatus.QUEUED] },
      "scheduling.scheduled_at": { $lte: now },
    });

    console.log(
      `Processing ${scheduledNotifications.length} scheduled notifications`
    );

    for (const notification of scheduledNotifications) {
      try {
        await sendPushNotificationCampaign(notification._id);
        console.log(
          `Successfully sent scheduled notification: ${notification._id}`
        );
      } catch (error: any) {
        console.error(
          `Failed to send scheduled notification ${notification._id}:`,
          error.message
        );
      }
    }

    return { processed: scheduledNotifications.length };
  } catch (error: any) {
    console.error("Error processing scheduled notifications:", error);
    throw error;
  }
};

/**
 * Retry failed notifications
 */
export const retryFailedNotifications = async () => {
  try {
    const failedNotifications = await PushNotification.find({
      status: DeliveryStatus.FAILED,
      "retry_policy.max_retries": { $gt: 0 },
    });

    console.log(`Retrying ${failedNotifications.length} failed notifications`);

    let retried = 0;

    for (const notification of failedNotifications) {
      try {
        const retriesAttempted = notification.events.filter(
          (e) => e.event_type === "sent"
        ).length;

        if (retriesAttempted >= notification.retry_policy.max_retries) {
          console.log(
            `Notification ${notification._id} has exceeded max retries`
          );
          continue;
        }

        await sendPushNotificationCampaign(notification._id);
        retried++;
      } catch (error: any) {
        console.error(
          `Failed to retry notification ${notification._id}:`,
          error.message
        );
      }
    }

    return { attempted: failedNotifications.length, retried };
  } catch (error: any) {
    console.error("Error retrying failed notifications:", error);
    throw error;
  }
};
