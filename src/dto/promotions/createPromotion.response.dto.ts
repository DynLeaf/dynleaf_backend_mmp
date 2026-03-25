export interface PromotionResponseDto {
    _id: string;
    outlet_id?: Record<string, unknown>;
    promotion_type: string;
    display_data: {
        banner_image_url: string;
        banner_text?: string;
        link_url: string;
    };
    scheduling: {
        start_date: string;
        end_date: string;
        display_priority: number;
    };
    targeting: {
        locations: string[];
        show_on_homepage: boolean;
    };
    payment?: {
        amount_paid?: number;
        payment_status?: string;
        payment_date?: string;
    };
    is_active: boolean;
    created_by?: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
}
