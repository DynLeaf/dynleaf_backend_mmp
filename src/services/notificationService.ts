import { Notification } from '../models/Notification.js';
import { PushNotification, DeliveryStatus, TargetAudienceType } from '../models/PushNotification.js';
import { Follow } from '../models/Follow.js';
import { Offer } from '../models/Offer.js';
import { Outlet } from '../models/Outlet.js';
import { User } from '../models/User.js';
import { sendPushNotificationToUsers } from './pushNotificationService.js';
import { Brand } from '../models/Brand.js';

export const notifyFollowersOfNewOffer = async (offerId: string, outletId: string) => {
    console.log(`[NotifyFollowers] Starting notification process for offer ${offerId} at outlet ${outletId}`);
    try {
        const [offer, outlet] = await Promise.all([
            Offer.findById(offerId),
            Outlet.findById(outletId),
        ]);

        if (!offer || !outlet) return;

        const brand = outlet.brand_id
            ? await Brand.findById(outlet.brand_id)
            : null;
            
        // Find all followers
        const followers = await Follow.find({ outlet: outletId }).select('user');

        if (followers.length === 0) return;

        const notifications = followers.map(f => ({
            user: f.user,
            title: `New Offer from ${outlet.name}`,
            message: `${offer.title}: ${offer.subtitle || 'Check out our new offer!'}`,
            type: 'OFFER',
            reference_id: offer._id,
            reference_model: 'Offer',
            link: `/restaurant/${outletId}/menu`, // Link to outlet menu page
            image: offer.banner_image_url || offer.background_image_url // Offer image
        }));

        // Bulk insert for efficiency
        await Notification.insertMany(notifications);

        console.log(`Notified ${followers.length} followers of new offer ${offerId}`);

        // Trigger Push Notifications
        const userIds = followers.map(f => f.user.toString());
        const notificationTitle = `New Offer from ${outlet.name}`;
        const notificationBody = `${offer.title}: ${offer.subtitle || 'Check out our new offer!'}`;
        const offerImage = offer.banner_image_url || offer.background_image_url || undefined;
        const link = (process.env.FRONTEND_URL || "https://www.dynleaf.com").toString();
        const restaurantBrandLogo = brand?.logo_url ? brand.logo_url.toString() : undefined;

        await sendPushNotificationToUsers(
            userIds,
            notificationTitle,
            notificationBody,
            link,
            offerImage ? offerImage.toString() : undefined,
            offerId.toString(),
            restaurantBrandLogo
        );

    } catch (error) {
        console.error('Error notifying followers:', error);
    }
};

/**
 * Check if a user matches a PushNotification's target audience
 */
const isUserInTargetAudience = async (userId: string, pushNotification: any): Promise<boolean> => {
    const { target_audience } = pushNotification;

    // Check if notification is sent (only show sent push notifications)
    if (pushNotification.status !== DeliveryStatus.SENT) {
        return false;
    }

    switch (target_audience.type) {
        case TargetAudienceType.ALL_USERS:
            return true;

        case TargetAudienceType.SELECTED_USERS:
            // Check if user is in the selected users list
            return (target_audience.user_ids || []).some((id: any) => id.toString() === userId);

        case TargetAudienceType.USER_ROLE:
            // Check if user's role matches
            if (!target_audience.roles || target_audience.roles.length === 0) {
                return false;
            }
            const user = await User.findById(userId).select('role').lean();
            return user ? target_audience.roles.includes((user as any).role) : false;

        case TargetAudienceType.SEGMENTED:
            // For segmented, check if user matches filters
            const user_seg = await User.findById(userId).lean();
            if (!user_seg) return false;

            const filters = target_audience.filters || {};

            // Check location filter
            if (filters.location) {
                const userLocation = (user_seg as any).location || '';
                if (userLocation !== filters.location) return false;
            }

            // Check user type filter
            if (filters.user_type) {
                const userType = (user_seg as any).user_type || '';
                if (userType !== filters.user_type) return false;
            }

            // Check engagement level filter (if stored in user)
            if (filters.engagement_level) {
                const userEngagement = (user_seg as any).engagement_level || 'low';
                if (userEngagement !== filters.engagement_level) return false;
            }

            // Check signup date range
            if (filters.signup_date_range) {
                const userSignupDate = (user_seg as any).createdAt;
                if (userSignupDate) {
                    const fromDate = new Date(filters.signup_date_range.from);
                    const toDate = new Date(filters.signup_date_range.to);
                    if (userSignupDate < fromDate || userSignupDate > toDate) {
                        return false;
                    }
                }
            }

            return true;

        default:
            return false;
    }
};

/**
 * Transform PushNotification to Notification format
 */
const transformPushNotificationToNotification = (pushNotif: any) => {
    return {
        _id: pushNotif._id,
        user: pushNotif.user,
        title: pushNotif.content.title,
        message: pushNotif.content.description,
        type: 'PROMOTION', // Map push notification to PROMOTION type
        reference_id: pushNotif._id,
        reference_model: 'PushNotification',
        link: pushNotif.content.action_url || pushNotif.content.deep_link,
        image: pushNotif.content.image_url,
        is_read: false, // Push notifications are always unread initially
        created_at: pushNotif.sent_at || pushNotif.created_at,
        is_push_notification: true, // Flag to differentiate in frontend if needed
    };
};

/**
 * Create content hash for deduplication
 */
const createContentHash = (title: string, message: string): string => {
    return `${title}::${message}`.toLowerCase();
};

export const getUserNotifications = async (userId: string, page = 1, limit = 20) => {
    const skip = (page - 1) * limit;

    console.log(`[GetNotifications] Fetching notifications for user: ${userId}`);

    // Fetch regular notifications
    const [regularNotifications, regularTotal] = await Promise.all([
        Notification.find({ user: userId })
            .sort({ created_at: -1 })
            .lean(),
        Notification.countDocuments({ user: userId })
    ]);

    console.log(`[GetNotifications] Found ${regularNotifications.length} regular notifications`);

    // Fetch all sent/partially sent push notifications (we'll filter by target audience)
    const pushNotifications = await PushNotification.find({
        status: { $in: [DeliveryStatus.SENT, DeliveryStatus.PARTIALLY_SENT] }
    })
        .sort({ sent_at: -1 })
        .lean();

    console.log(`[GetNotifications] Found ${pushNotifications.length} push notifications with SENT or PARTIALLY_SENT status`);

    // Filter push notifications for this specific user
    const userPushNotifications = [];
    for (const pushNotif of pushNotifications) {
        const isInAudience = await isUserInTargetAudience(userId, pushNotif);
        console.log(`[GetNotifications] Push notification "${pushNotif.content.title}" - User in audience: ${isInAudience}, Target type: ${pushNotif.target_audience.type}`);
        if (isInAudience) {
            userPushNotifications.push(transformPushNotificationToNotification(pushNotif));
        }
    }

    console.log(`[GetNotifications] After audience filter: ${userPushNotifications.length} push notifications for this user`);

    // Merge notifications
    const allNotifications = [...regularNotifications, ...userPushNotifications];

    console.log(`[GetNotifications] Total merged notifications: ${allNotifications.length}`);

    // Deduplicate by content (title + message)
    const contentHashes = new Set<string>();
    const deduplicatedNotifications = allNotifications.filter(notif => {
        const hash = createContentHash(notif.title, notif.message);
        if (contentHashes.has(hash)) {
            console.log(`[GetNotifications] Deduplicating: "${notif.title}" (duplicate content)`);
            return false; // Skip duplicate
        }
        contentHashes.add(hash);
        return true;
    });

    console.log(`[GetNotifications] After deduplication: ${deduplicatedNotifications.length} notifications`);

    // Sort by date descending and apply pagination
    const sortedNotifications = deduplicatedNotifications.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const paginatedNotifications = sortedNotifications.slice(skip, skip + limit);

    // Transform notifications to ensure they have proper links
    const transformedNotifications = await Promise.all(paginatedNotifications.map(async (n: any) => {
        // If notification already has a link, use it
        if (n.link) return n;

        // For OFFER type notifications without a link, generate one from the offer
        if (n.type === 'OFFER' && n.reference_id && n.reference_model === 'Offer') {
            try {
                const offer = await Offer.findById(n.reference_id).select('outlet_ids banner_image_url background_image_url').lean();
                if (offer && offer.outlet_ids && offer.outlet_ids.length > 0) {
                    // Use the first outlet ID to generate the link
                    n.link = `/restaurant/${offer.outlet_ids[0]}/menu`;
                    // Also add image if not present
                    if (!n.image) {
                        n.image = offer.banner_image_url || offer.background_image_url;
                    }
                }
            } catch (error) {
                console.error('Error generating link for notification:', error);
            }
        }

        return n;
    }));

    // Count unread notifications
    const unreadRegular = regularNotifications.filter(n => !n.is_read).length;
    const unreadPush = userPushNotifications.filter(n => !n.is_read).length;

    console.log(`[GetNotifications] Response - Regular: ${regularNotifications.length}, Push: ${userPushNotifications.length}, Total unread: ${unreadRegular + unreadPush}`);

    return {
        notifications: transformedNotifications,
        pagination: {
            total: sortedNotifications.length, // Total after deduplication
            page,
            limit,
            pages: Math.ceil(sortedNotifications.length / limit)
        },
        unreadCount: unreadRegular + unreadPush
    };
};

export const markAsRead = async (userId: string, notificationId?: string) => {
    if (notificationId) {
        await Notification.findOneAndUpdate({ _id: notificationId, user: userId }, { is_read: true });
    } else {
        await Notification.updateMany({ user: userId, is_read: false }, { is_read: true });
    }
};

export const registerPushToken = async (userId: string, fcmToken: string) => {
    await User.findByIdAndUpdate(userId, {
        $addToSet: { fcm_tokens: fcmToken }
    });
};
