import { OfferResponseDto } from './createOffer.response.dto.js';

export interface ListOffersResponseDto {
    offers: OfferResponseDto[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        pages: number;
    };
}

export interface NearbyOfferDto {
    _id: string;
    title: string;
    subtitle?: string;
    description?: string;
    offer_type?: string;
    banner_image_url?: string;
    discount_percentage?: number;
    discount_amount?: number;
    valid_till?: string;
    code?: string;
    distance: number;
    outlet?: Record<string, unknown>;
    brand?: Record<string, unknown>;
}

export interface NearbyOffersResponseDto {
    offers: NearbyOfferDto[];
    metadata: {
        total: number;
        search_radius_km: number;
        center: { latitude: number; longitude: number };
    };
}
