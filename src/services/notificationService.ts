import * as notifRepo from '../repositories/notificationRepository.js';
import * as pushNotifRepo from '../repositories/pushNotificationRepository.js';
import * as offerRepo from '../repositories/offerRepository.js';
import * as deviceTokenRepo from '../repositories/deviceTokenRepository.js';
import * as pushNotifService from './pushNotificationService.js';

export const notifyFollowersOfNewOffer = async (offerId: string, outletId: string) => {
    try {
        // Import follow and outlet repos lazily to avoid circular deps
        const followRepo = await import('../repositories/followRepository.js');
        const outletService = await import('./outletService.js');

        const [offerList, outlet] = await Promise.all([
            offerRepo.findByIds([offerId]),
            outletService.getOutletById(outletId),
        ]);

        const offer = offerList[0];
        if (!offer || !outlet) return;

        const outletObj = outlet as unknown as Record<string, unknown>;
        const offerObj = offer as Record<string, unknown>;

        let brandName = '';
        try {
            const brandService = await import('./brandService.js');
            const brand = outletObj.brand_id ? await brandService.getBrandById(String(outletObj.brand_id)) : null;
            brandName = brand ? String((brand as unknown as Record<string, unknown>).name || '') : '';
        } catch { /* brand lookup optional */ }

        const followers = await followRepo.findByOutlet(outletId);
        if (!followers || followers.length === 0) return;

        const notifications = followers.map((f) => {
            const fObj = f as unknown as Record<string, unknown>;
            return {
                user: fObj.user,
                title: `New Offer from ${outletObj.name}`,
                message: `${offerObj.title}: ${offerObj.subtitle || 'Check out our new offer!'}`,
                type: 'OFFER',
                reference_id: offerObj._id,
                reference_model: 'Offer',
                link: `/restaurant/${outletId}/menu`,
                image: offerObj.banner_image_url || offerObj.background_image_url,
            };
        });

        await notifRepo.insertMany(notifications);

        const userIds = followers.map((f) => String((f as unknown as Record<string, unknown>).user));
        const notificationTitle = `New Offer from ${outletObj.name}`;
        const notificationBody = `${offerObj.title}: ${offerObj.subtitle || 'Check out our new offer!'}`;
        const offerImage = (offerObj.banner_image_url || offerObj.background_image_url || undefined) as string | undefined;
        const link = (process.env.FRONTEND_URL || 'https://www.dynleaf.com').toString();

        await pushNotifService.sendToUsers(userIds, notificationTitle, notificationBody, link, offerImage, String(offerId));
    } catch (error) {
        console.error('Error notifying followers:', error);
    }
};

export const getUserNotifications = async (userId: string, page = 1, limit = 20) => {
    const skip = (page - 1) * limit;

    const regularNotifications = await notifRepo.findByUser(userId);

    const pushNotifications = await pushNotifRepo.findSentOrPartiallySent();
    const userPushNotifications: Record<string, unknown>[] = [];

    for (const pn of pushNotifications) {
        const pnObj = pn as unknown as Record<string, unknown>;
        const audience = pnObj.target_audience as Record<string, unknown>;
        const status = pnObj.status as string;
        if (status !== 'sent' && status !== 'partially_sent') continue;

        let isInAudience = false;
        if (audience.type === 'all_users') {
            isInAudience = true;
        } else if (audience.type === 'selected_users') {
            isInAudience = ((audience.user_ids as string[]) || []).some(id => String(id) === userId);
        } else if (audience.type === 'user_role') {
            const user = await deviceTokenRepo.findUserById(userId);
            isInAudience = user ? ((audience.roles as string[]) || []).includes(String((user as unknown as Record<string, unknown>).role)) : false;
        }

        if (isInAudience) {
            const content = pnObj.content as Record<string, unknown>;
            userPushNotifications.push({
                _id: pnObj._id,
                title: content.title, message: content.description,
                type: 'PROMOTION', reference_id: pnObj._id,
                reference_model: 'PushNotification',
                link: content.action_url || content.deep_link,
                image: content.image_url, is_read: false,
                created_at: pnObj.sent_at || pnObj.created_at,
                is_push_notification: true,
            });
        }
    }

    const allNotifications = [...regularNotifications, ...userPushNotifications];

    // Deduplicate by content
    const hashes = new Set<string>();
    const deduped = allNotifications.filter(n => {
        const nObj = n as unknown as Record<string, unknown>;
        const hash = `${nObj.title}::${nObj.message}`.toLowerCase();
        if (hashes.has(hash)) return false;
        hashes.add(hash);
        return true;
    });

    deduped.sort((a, b) => new Date(String((b as unknown as Record<string, unknown>).created_at)).getTime() - new Date(String((a as unknown as Record<string, unknown>).created_at)).getTime());
    const paginated = deduped.slice(skip, skip + limit);

    // Enrich offer notifications with links
    const enriched = await Promise.all(paginated.map(async (n) => {
        const nObj = n as unknown as Record<string, unknown>;
        if (nObj.link) return nObj;
        if (nObj.type === 'OFFER' && nObj.reference_id && nObj.reference_model === 'Offer') {
            try {
                const offers = await offerRepo.findByIds([String(nObj.reference_id)]);
                const offer = offers[0] as Record<string, unknown> | undefined;
                if (offer?.outlet_ids && (offer.outlet_ids as string[]).length > 0) {
                    nObj.link = `/restaurant/${(offer.outlet_ids as string[])[0]}/menu`;
                    if (!nObj.image) nObj.image = offer.banner_image_url;
                }
            } catch { /* optional enrichment */ }
        }
        return nObj;
    }));

    const unreadRegular = regularNotifications.filter(n => !(n as unknown as Record<string, unknown>).is_read).length;
    const unreadPush = userPushNotifications.filter(n => !n.is_read).length;

    return {
        notifications: enriched,
        pagination: { total: deduped.length, page, limit, pages: Math.ceil(deduped.length / limit) },
        unreadCount: unreadRegular + unreadPush,
    };
};

export const markAsRead = async (userId: string, notificationId?: string) => {
    if (notificationId) {
        await notifRepo.markOneRead(userId, notificationId);
    } else {
        await notifRepo.markAllRead(userId);
    }
};

export const registerPushToken = async (userId: string, fcmToken: string) => {
    await deviceTokenRepo.addFcmToken(userId, fcmToken);
};
