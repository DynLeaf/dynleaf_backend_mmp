export interface UpdateOfferRequestDto {
    title?: string;
    subtitle?: string;
    description?: string;
    offer_type?: string;
    banner_image_url?: string;
    background_image_url?: string;
    badge_text?: string;
    code?: string;
    terms?: string;
    discount_percentage?: number;
    discount_amount?: number;
    max_discount_amount?: number;
    min_order_amount?: number;
    applicable_category_ids?: string[];
    applicable_food_item_ids?: string[];
    days_of_week?: number[];
    time_from?: string;
    time_to?: string;
    valid_from?: string;
    valid_till?: string;
    show_on_menu?: boolean;
    display_order?: number;
    is_active?: boolean;
}
