import { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import {
  PushNotification,
  DeliveryStatus,
  TargetAudienceType,
  NotificationType,
  IPushNotificationDocument,
} from "../models/PushNotification.js";
import { User } from "../models/User.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { v2 as cloudinary } from "cloudinary";
import mongoose from "mongoose";
import { sendPushNotificationCampaign } from "../services/pushNotificationService.js";

type PushNotificationDocWithMethods = IPushNotificationDocument & {
  addEvent: (
    event_type:
      | "created"
      | "scheduled"
      | "sent"
      | "failed"
      | "clicked"
      | "dismissed",
    metadata?: Record<string, any>
  ) => Promise<any>;
};

/**
 * Push Notification Controller
 * Handles creation, management, and sending of push notifications
 */

// ============================================
// CREATE NOTIFICATION
// ============================================
export const createPushNotification = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const {
      title,
      description,
      image_url,
      image_public_id,
      target_audience,
      scheduling,
      notification_type,
    } = req.body;

    // Validation
    if (!title || !title.trim()) {
      return sendError(res, "Title is required", 400);
    }

    if (!description || !description.trim()) {
      return sendError(res, "Description is required", 400);
    }

    if (!target_audience || !target_audience.type) {
      return sendError(res, "Target audience type is required", 400);
    }

    if (!scheduling || !scheduling.type) {
      return sendError(res, "Scheduling type is required", 400);
    }

    // Validate scheduling
    if (scheduling.type === "scheduled") {
      if (!scheduling.scheduled_at) {
        return sendError(
          res,
          "scheduled_at is required when scheduling type is scheduled",
          400
        );
      }

      const scheduledDate = new Date(scheduling.scheduled_at);
      if (scheduledDate < new Date()) {
        return sendError(res, "scheduled_at cannot be in the past", 400);
      }
    }

    // Validate target audience
    if (
      target_audience.type === TargetAudienceType.USER_ROLE &&
      (!target_audience.roles || target_audience.roles.length === 0)
    ) {
      return sendError(
        res,
        "Roles must be provided when targeting by user role",
        400
      );
    }

    // Handle user ID - if not a valid ObjectId, find the user safely
    let userId: any = req.user.id;

    // Check if it's a valid ObjectId first
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      // If system/admin user or invalid string, find user by username or email
      if (userId === "admin" || typeof userId === "string") {
        const user = await User.findOne({
          $or: [
            { username: userId },
            { email: userId }
          ],
        }).select("_id");

        if (user) {
          userId = user._id;
        } else {
          // If user not found and is "admin", create a placeholder or use system user
          // For now, we'll reject if user is not found
          return sendError(
            res,
            "Admin user not found. Ensure admin is properly configured.",
            401
          );
        }
      }
    }

    // Create notification
    const pushNotification = new PushNotification({
      title: title.trim(),
      description: description.trim(),
      content: {
        title: title.trim(),
        description: description.trim(),
        image_url: image_url || undefined,
        image_public_id: image_public_id || undefined,
        custom_data: req.body.custom_data || {},
      },
      target_audience,
      scheduling,
      notification_type: notification_type || NotificationType.PROMOTIONAL,
      created_by: userId,
      status:
        scheduling.type === "immediate"
          ? DeliveryStatus.DRAFT
          : DeliveryStatus.SCHEDULED,
    });

    // Add creation event
    pushNotification.events.push({
      event_type: "created",
      timestamp: new Date(),
      metadata: {
        created_by_user_id: req.user.id,
      },
    });

    await pushNotification.save();

    return sendSuccess(
      res,
      pushNotification.toJSON(),
      "Push notification created successfully",
      201
    );
  } catch (error: any) {
    console.error("Create push notification error:", error);
    return sendError(
      res,
      error.message || "Failed to create push notification"
    );
  }
};

// ============================================
// GET NOTIFICATIONS (LIST)
// ============================================
export const getPushNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const skip = (page - 1) * limit;

    const query: any = {};

    // Filter by status if provided
    if (status && status !== "all") {
      if (!Object.values(DeliveryStatus).includes(status as DeliveryStatus)) {
        return sendError(res, "Invalid status filter", 400);
      }
      query.status = status;
    }

    const [notifications, total] = await Promise.all([
      PushNotification.find(query)
        .populate("created_by", "username email phone")
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PushNotification.countDocuments(query),
    ]);

    return sendSuccess(res, {
      notifications: notifications.map((n: any) => ({
        ...n,
        computed_ctr:
          n.delivery_metrics.sent === 0
            ? 0
            : (n.analytics.clicks / n.delivery_metrics.sent) * 100,
      })),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("Get push notifications error:", error);
    return sendError(res, error.message || "Failed to fetch notifications");
  }
};

// ============================================
// GET SINGLE NOTIFICATION DETAIL
// ============================================
export const getPushNotificationDetail = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, "Invalid notification ID", 400);
    }

    const notification = await PushNotification.findById(id).populate(
      "created_by",
      "username email phone"
    );

    if (!notification) {
      return sendError(res, "Notification not found", 404);
    }

    return sendSuccess(res, notification.toJSON());
  } catch (error: any) {
    console.error("Get notification detail error:", error);
    return sendError(res, error.message || "Failed to fetch notification");
  }
};

// ============================================
// UPDATE NOTIFICATION
// ============================================
export const updatePushNotification = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      image_url,
      image_public_id,
      target_audience,
      scheduling,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, "Invalid notification ID", 400);
    }

    const notification = (await PushNotification.findById(
      id
    )) as PushNotificationDocWithMethods | null;

    if (!notification) {
      return sendError(res, "Notification not found", 404);
    }

    // Can only edit draft notifications
    if (notification.status !== DeliveryStatus.DRAFT) {
      return sendError(
        res,
        `Cannot edit ${notification.status} notifications`,
        400
      );
    }

    // Validate input
    if (title && !title.trim()) {
      return sendError(res, "Title cannot be empty", 400);
    }

    if (description && !description.trim()) {
      return sendError(res, "Description cannot be empty", 400);
    }

    if (scheduling?.type === "scheduled") {
      if (!scheduling.scheduled_at) {
        return sendError(
          res,
          "scheduled_at is required for scheduled notifications",
          400
        );
      }

      const scheduledDate = new Date(scheduling.scheduled_at);
      if (scheduledDate < new Date()) {
        return sendError(res, "scheduled_at cannot be in the past", 400);
      }
    }

    // Update fields
    if (title) notification.title = title.trim();
    if (description) notification.description = description.trim();

    if (title || description || image_url !== undefined) {
      notification.content.title = title?.trim() || notification.content.title;
      notification.content.description =
        description?.trim() || notification.content.description;
      if (image_url !== undefined) {
        notification.content.image_url = image_url;
        notification.content.image_public_id = image_public_id;
      }
    }

    if (target_audience) {
      notification.target_audience = target_audience;
    }

    if (scheduling) {
      notification.scheduling = scheduling;
    }

    await notification.save();

    return sendSuccess(
      res,
      notification.toJSON(),
      "Notification updated successfully"
    );
  } catch (error: any) {
    console.error("Update push notification error:", error);
    return sendError(res, error.message || "Failed to update notification");
  }
};

// ============================================
// SEND NOTIFICATION
// ============================================
export const sendPushNotification = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, "Invalid notification ID", 400);
    }

    const notification = (await PushNotification.findById(
      id
    )) as PushNotificationDocWithMethods | null;

    if (!notification) {
      return sendError(res, "Notification not found", 404);
    }

    // Can only send draft or scheduled notifications
    if (
      ![DeliveryStatus.DRAFT, DeliveryStatus.SCHEDULED].includes(
        notification.status
      )
    ) {
      return sendError(
        res,
        `Cannot send ${notification.status} notifications`,
        400
      );
    }

    // Mark as queued/sending
    notification.status = DeliveryStatus.SENDING;
    notification.sent_at = new Date();
    await notification.save();

    // Determine target users based on audience type
    let targetUsers: any[] = [];

    if (notification.target_audience.type === TargetAudienceType.ALL_USERS) {
      // Get all users
      targetUsers = await User.find()
        .select("_id username email phone fcm_tokens")
        .lean();
      console.log(`[DEBUG] ALL_USERS: Found ${targetUsers.length} users`);
      if (targetUsers.length > 0) {
        console.log(`[DEBUG] First user:`, JSON.stringify(targetUsers[0], null, 2));
      }
    } else if (
      notification.target_audience.type === TargetAudienceType.SELECTED_USERS
    ) {
      // Get selected users
      const userIds = notification.target_audience.user_ids || [];
      targetUsers = await User.find({ _id: { $in: userIds } })
        .select("_id username email phone fcm_tokens")
        .lean();
    } else if (
      notification.target_audience.type === TargetAudienceType.USER_ROLE
    ) {
      // Get users with specific roles
      const roles = notification.target_audience.roles || [];
      targetUsers = await User.find({
        "roles.role": { $in: roles },
      })
        .select("_id username email phone fcm_tokens")
        .lean();
    }

    console.log(`\n📱 Sending notification to ${targetUsers.length} users...`);
    console.log(
      `═══════════════════════════════════════════════════════════════`
    );
    console.log(`[DEBUG] Total target users found: ${targetUsers.length}`);
    if (targetUsers.length > 0) {
      console.log(`[DEBUG] Sample user:`, JSON.stringify(targetUsers[0]));
    }

    // Filter users with FCM tokens
    const usersWithTokens = targetUsers.filter(
      (user: any) => user.fcm_tokens && user.fcm_tokens.length > 0
    );
    const usersWithoutTokens = targetUsers.filter(
      (user: any) => !user.fcm_tokens || user.fcm_tokens.length === 0
    );

    console.log(`[DEBUG] Users with tokens: ${usersWithTokens.length}`);
    console.log(`[DEBUG] Users without tokens: ${usersWithoutTokens.length}`);
    console.log(`✅ Users with FCM tokens: ${usersWithTokens.length}`);
    console.log(`⚠️  Users without FCM tokens: ${usersWithoutTokens.length}`);

    if (usersWithTokens.length === 0) {
      notification.status = DeliveryStatus.FAILED;
      notification.delivery_metrics.total_recipients = targetUsers.length;
      notification.delivery_metrics.failed = targetUsers.length;
      notification.retry_policy.failed_delivery_reason?.push(
        "No users with FCM tokens found"
      );
      await notification.save();

      return sendError(
        res,
        "No users with FCM tokens to send notification to",
        400
      );
    }

    // Send via FCM using the service
    console.log(`\n🔄 Sending push notifications via Firebase...`);
    const result = await sendPushNotificationCampaign(id);

    console.log(`\n✅ Push notification results:`);
    console.log(`   • Successfully sent: ${result.success}`);
    console.log(`   • Failed: ${result.failure}`);

    // Fetch updated notification
    const updatedNotification = await PushNotification.findById(id);

    // Prepare user details list for response
    const sentUserDetails = usersWithTokens.map((user: any) => ({
      _id: user._id.toString(),
      name: user.username,
      phone: user.phone || "N/A",
      email: user.email,
      tokens_count: user.fcm_tokens?.length || 0,
    }));

    console.log(`\n📋 Users who received the notification:`);
    console.log(
      `═══════════════════════════════════════════════════════════════`
    );
    sentUserDetails.forEach((user, index) => {
      console.log(
        `${index + 1}. ${user.name} | Phone: ${user.phone} | Email: ${user.email}`
      );
    });
    console.log(
      `═══════════════════════════════════════════════════════════════\n`
    );

    // Add sent event
    await updatedNotification?.addEvent("sent", {
      total_recipients: targetUsers.length,
      users_sent: result.success,
      users_failed: result.failure,
      sent_by: req.user.id,
      timestamp: new Date(),
    });

    return sendSuccess(
      res,
      {
        _id: updatedNotification?._id,
        status: updatedNotification?.status,
        total_targeted: targetUsers.length,
        successfully_sent: result.success,
        failed: result.failure,
        users_with_tokens: usersWithTokens.length,
        users_without_tokens: usersWithoutTokens.length,
        user_details: sentUserDetails,
        message: `Notification sent to ${result.success} user(s) successfully`,
      },
      `Notification sent to ${result.success}/${targetUsers.length} recipients`
    );
  } catch (error: any) {
    console.error("Send push notification error:", error);
    return sendError(res, error.message || "Failed to send notification");
  }
};

// ============================================
// DELETE NOTIFICATION
// ============================================
export const deletePushNotification = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, "Invalid notification ID", 400);
    }

    const notification = (await PushNotification.findById(
      id
    )) as PushNotificationDocWithMethods | null;

    if (!notification) {
      return sendError(res, "Notification not found", 404);
    }

    // Can only delete draft notifications
    if (notification.status !== DeliveryStatus.DRAFT) {
      return sendError(
        res,
        `Cannot delete ${notification.status} notifications`,
        400
      );
    }

    // Delete image from Cloudinary if exists
    if (notification.content.image_public_id) {
      try {
        await cloudinary.uploader.destroy(notification.content.image_public_id);
      } catch (cloudinaryError: any) {
        console.error("Cloudinary deletion error:", cloudinaryError);
        // Continue with deletion even if Cloudinary fails
      }
    }

    await PushNotification.findByIdAndDelete(id);

    return sendSuccess(res, { _id: id }, "Notification deleted successfully");
  } catch (error: any) {
    console.error("Delete push notification error:", error);
    return sendError(res, error.message || "Failed to delete notification");
  }
};

// ============================================
// GET NOTIFICATION ANALYTICS
// ============================================
export const getPushNotificationAnalytics = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, "Invalid notification ID", 400);
    }

    const notification = await PushNotification.findById(id, {
      analytics: 1,
      delivery_metrics: 1,
      events: 1,
      created_at: 1,
      sent_at: 1,
    });

    if (!notification) {
      return sendError(res, "Notification not found", 404);
    }

    const computedCTR =
      notification.delivery_metrics.sent === 0
        ? 0
        : (notification.analytics.clicks / notification.delivery_metrics.sent) *
          100;

    return sendSuccess(res, {
      _id: notification._id,
      delivery_metrics: notification.delivery_metrics,
      analytics: {
        ...notification.analytics,
        ctr: computedCTR,
      },
      events: notification.events,
      created_at: notification.created_at,
      sent_at: notification.sent_at,
    });
  } catch (error: any) {
    console.error("Get notification analytics error:", error);
    return sendError(res, error.message || "Failed to fetch analytics");
  }
};

// ============================================
// GET CLOUDINARY SIGNATURE (FOR IMAGE UPLOAD)
// ============================================
export const getCloudinarySignatureForNotification = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      console.error("Cloudinary configuration missing:", {
        cloudName: !!cloudName,
        apiKey: !!apiKey,
        apiSecret: !!apiSecret,
      });
      return sendError(res, "Cloudinary is not configured", 500);
    }

    const timestamp = Math.round(Date.now() / 1000);
    const folder = "notifications";

    // Create signature for unsigned upload
    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        folder,
      },
      apiSecret
    );

    if (!signature) {
      return sendError(res, "Failed to generate Cloudinary signature", 500);
    }

    return sendSuccess(res, {
      signature,
      timestamp,
      cloud_name: cloudName,
      api_key: apiKey,
      folder,
    });
  } catch (error: any) {
    console.error("Get Cloudinary signature error:", error);
    return sendError(
      res,
      error.message || "Failed to get upload signature",
      500
    );
  }
};

// ============================================
// RECORD NOTIFICATION EVENT (Click, Dismiss, etc)
// ============================================
export const recordNotificationEvent = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { notificationId } = req.params;
    const { event_type, metadata } = req.body;

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return sendError(res, "Invalid notification ID", 400);
    }

    const validEvents = ["clicked", "dismissed"];
    if (!validEvents.includes(event_type)) {
      return sendError(
        res,
        `Invalid event type. Must be one of: ${validEvents.join(", ")}`,
        400
      );
    }

    const notification = (await PushNotification.findById(
      notificationId
    )) as PushNotificationDocWithMethods | null;

    if (!notification) {
      return sendError(res, "Notification not found", 404);
    }

    // Update analytics based on event
    if (event_type === "clicked") {
      notification.analytics.clicks += 1;
      notification.delivery_metrics.clicked =
        (notification.delivery_metrics.clicked || 0) + 1;
    } else if (event_type === "dismissed") {
      notification.delivery_metrics.dismissed =
        (notification.delivery_metrics.dismissed || 0) + 1;
    }

    // Handle user ID for event logging safely
    let userId: any = req.user?.id;

    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      const query: any = {
        $or: [{ username: userId }, { email: userId }],
      };

      if (mongoose.Types.ObjectId.isValid(userId)) {
        query.$or.push({ _id: userId });
      }

      const user = await User.findOne(query).select("_id");

      if (user) {
        userId = user._id;
      }
    }

    // Add event log
    await notification.addEvent(event_type, {
      user_id: userId,
      ...metadata,
    });

    return sendSuccess(
      res,
      { event_type, recorded_at: new Date() },
      "Event recorded"
    );
  } catch (error: any) {
    console.error("Record notification event error:", error);
    return sendError(res, error.message || "Failed to record event");
  }
};

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Get notifications dashboard stats for admin overview
 */
export const getPushNotificationStats = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const [total, draft, scheduled, sent, failed, totalSent, totalClicks] =
      await Promise.all([
        PushNotification.countDocuments(),
        PushNotification.countDocuments({ status: DeliveryStatus.DRAFT }),
        PushNotification.countDocuments({ status: DeliveryStatus.SCHEDULED }),
        PushNotification.countDocuments({ status: DeliveryStatus.SENT }),
        PushNotification.countDocuments({ status: DeliveryStatus.FAILED }),
        PushNotification.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: "$delivery_metrics.sent" },
            },
          },
        ]),
        PushNotification.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: "$analytics.clicks" },
            },
          },
        ]),
      ]);

    return sendSuccess(res, {
      total_notifications: total,
      by_status: {
        draft,
        scheduled,
        sent,
        failed,
      },
      delivery_stats: {
        total_sent: totalSent[0]?.total || 0,
        total_clicks: totalClicks[0]?.total || 0,
      },
    });
  } catch (error: any) {
    console.error("Get notification stats error:", error);
    return sendError(res, error.message || "Failed to fetch stats");
  }
};
