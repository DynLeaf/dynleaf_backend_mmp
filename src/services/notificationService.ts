import { Notification } from '../models/Notification.js';
import { Follow } from '../models/Follow.js';
import { Offer } from '../models/Offer.js';
import { Outlet } from '../models/Outlet.js';
import { User } from '../models/User.js';
import { sendPushNotificationToUsers } from './pushNotificationService.js';

export const notifyFollowersOfNewOffer = async (offerId: string, outletId: string) => {
    console.log(`[NotifyFollowers] Starting notification process for offer ${offerId} at outlet ${outletId}`);
    try {
        const [offer, outlet] = await Promise.all([
            Offer.findById(offerId),
            Outlet.findById(outletId)
        ]);

        if (!offer || !outlet) return;

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

        await sendPushNotificationToUsers(
            userIds,
            notificationTitle,
            notificationBody,
            {
                type: 'OFFER',
                offerId: offerId.toString(),
                outletId: outletId.toString()
            }
        );

    } catch (error) {
        console.error('Error notifying followers:', error);
    }
};

export const getUserNotifications = async (userId: string, page = 1, limit = 20) => {
    const skip = (page - 1) * limit;
    const [notifications, total, unreadCount] = await Promise.all([
        Notification.find({ user: userId })
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .lean(), // Use lean() to get plain objects for easier transformation
        Notification.countDocuments({ user: userId }),
        Notification.countDocuments({ user: userId, is_read: false })
    ]);

    // Transform notifications to ensure they have proper links
    // This handles old notifications created before link field was added
    const transformedNotifications = await Promise.all(notifications.map(async (n: any) => {
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

    return {
        notifications: transformedNotifications,
        pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        },
        unreadCount
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
