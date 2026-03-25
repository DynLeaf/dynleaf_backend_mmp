import * as offerRepo from '../repositories/offerRepository.js';
import * as outletService from './outletService.js';
import { notifyFollowersOfNewOffer } from './notificationService.js';
import { AppError, ErrorCode } from '../errors/AppError.js';
import { CreateOfferRequestDto } from '../dto/offers/createOffer.request.dto.js';
import { UpdateOfferRequestDto } from '../dto/offers/updateOffer.request.dto.js';

interface AuthUser {
    id: string;
    activeRole?: { role?: string };
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const DEFAULT_RADIUS = 50000;

export const createOffer = async (outletId: string, dto: CreateOfferRequestDto, user: AuthUser, preloadedOutlet?: Record<string, unknown>) => {
    const outlet = preloadedOutlet ?? await outletService.getOutletById(outletId);
    if (!outlet) throw new AppError('Outlet not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const actualOutletId = (outlet as unknown as Record<string, unknown>)._id;

    const offerData: Record<string, unknown> = {
        brand_id: (outlet as unknown as Record<string, unknown>).brand_id,
        created_by_user_id: user.id,
        created_by_role: user.activeRole?.role,
        outlet_ids: [actualOutletId],
        location: (outlet as unknown as Record<string, unknown>).location,
        title: dto.title,
        subtitle: dto.subtitle,
        description: dto.description,
        offer_type: dto.offer_type,
        banner_image_url: dto.banner_image_url,
        background_image_url: dto.background_image_url,
        badge_text: dto.badge_text,
        code: dto.code,
        terms: dto.terms,
        discount_percentage: dto.discount_percentage,
        discount_amount: dto.discount_amount,
        max_discount_amount: dto.max_discount_amount,
        min_order_amount: dto.min_order_amount,
        applicable_category_ids: dto.applicable_category_ids,
        applicable_food_item_ids: dto.applicable_food_item_ids,
        days_of_week: dto.days_of_week,
        time_from: dto.time_from,
        time_to: dto.time_to,
        valid_from: dto.valid_from ? new Date(dto.valid_from) : undefined,
        valid_till: dto.valid_till ? new Date(dto.valid_till) : undefined,
        show_on_menu: dto.show_on_menu ?? true,
        display_order: dto.display_order ?? 0,
        is_active: dto.is_active ?? true,
        approval_status: 'approved'
    };

    const offer = await offerRepo.create(offerData);

    // Async notification — fire and forget
    notifyFollowersOfNewOffer(String(offer._id), String(actualOutletId))
        .catch(err => console.error('[OfferService] Notification error:', err));

    return offer;
};

export const getOutletOffers = async (outletId: string, query: Record<string, unknown>) => {
    const outlet = await outletService.getOutletById(outletId);
    if (!outlet) throw new AppError('Outlet not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const actualOutletId = String((outlet as unknown as Record<string, unknown>)._id);
    const page = Number(query.page ?? DEFAULT_PAGE);
    const limit = Number(query.limit ?? DEFAULT_LIMIT);
    const skip = (page - 1) * limit;

    const filter: { is_active?: boolean } = {};
    if (query.is_active !== undefined) filter.is_active = query.is_active === 'true';

    const { offers, total } = await offerRepo.findByOutlet(actualOutletId, filter, skip, limit);

    return {
        offers,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    };
};

export const getOfferById = async (outletId: string, offerId: string) => {
    const outlet = await outletService.getOutletById(outletId);
    if (!outlet) throw new AppError('Outlet not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const actualOutletId = String((outlet as unknown as Record<string, unknown>)._id);
    const offer = await offerRepo.findByIdAndOutlet(offerId, actualOutletId);
    if (!offer) throw new AppError('Offer not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    return offer;
};

export const getOfferByIdDirect = async (offerId: string) => {
    const offer = await offerRepo.findByIdDirect(offerId);
    if (!offer) throw new AppError('Offer not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const primaryOutlet = Array.isArray(offer.outlet_ids) ? offer.outlet_ids[0] : offer.outlet_ids;
    return { ...offer, outlet: primaryOutlet, brand: offer.brand_id };
};

export const updateOffer = async (outletId: string, offerId: string, dto: UpdateOfferRequestDto) => {
    const outlet = await outletService.getOutletById(outletId);
    if (!outlet) throw new AppError('Outlet not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const actualOutletId = String((outlet as unknown as Record<string, unknown>)._id);
    const existing = await offerRepo.findByIdAndOutlet(offerId, actualOutletId);
    if (!existing) throw new AppError('Offer not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
        if (value !== undefined) {
            if (key === 'valid_from' || key === 'valid_till') {
                updates[key] = new Date(value as string);
            } else {
                updates[key] = value;
            }
        }
    }

    return await offerRepo.updateById(offerId, updates);
};

export const deleteOffer = async (outletId: string, offerId: string) => {
    const outlet = await outletService.getOutletById(outletId);
    if (!outlet) throw new AppError('Outlet not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const actualOutletId = String((outlet as unknown as Record<string, unknown>)._id);
    const deleted = await offerRepo.deleteByIdAndOutlet(offerId, actualOutletId);
    if (!deleted) throw new AppError('Offer not found', 404, ErrorCode.RESOURCE_NOT_FOUND);
};

export const toggleOfferStatus = async (outletId: string, offerId: string) => {
    const outlet = await outletService.getOutletById(outletId);
    if (!outlet) throw new AppError('Outlet not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const actualOutletId = String((outlet as unknown as Record<string, unknown>)._id);
    const existing = await offerRepo.findByIdAndOutlet(offerId, actualOutletId);
    if (!existing) throw new AppError('Offer not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const newStatus = !existing.is_active;
    const updated = await offerRepo.updateById(offerId, { is_active: newStatus });
    return { offer: updated, message: `Offer ${newStatus ? 'activated' : 'deactivated'} successfully` };
};

export const getNearbyOffers = async (query: Record<string, unknown>) => {
    const latitude = parseFloat(String(query.latitude));
    const longitude = parseFloat(String(query.longitude));
    if (isNaN(latitude) || isNaN(longitude)) {
        throw new AppError('Latitude and longitude are required', 400, ErrorCode.VALIDATION_ERROR);
    }

    const radius = parseInt(String(query.radius ?? DEFAULT_RADIUS));
    const limit = parseInt(String(query.limit ?? DEFAULT_LIMIT));
    const search = query.search ? String(query.search) : undefined;

    const offers = await offerRepo.aggregateNearby({ latitude, longitude, radius, limit, search });

    return {
        offers,
        metadata: { total: offers.length, search_radius_km: radius / 1000, center: { latitude, longitude } }
    };
};
