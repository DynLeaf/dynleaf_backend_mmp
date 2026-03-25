export interface SendPushRequestDto {
    title: string;
    description: string;
    image_url?: string;
    image_public_id?: string;
    custom_data?: Record<string, string>;
    target_audience: {
        type: string;
        user_ids?: string[];
        roles?: string[];
        filters?: Record<string, unknown>;
    };
    scheduling: {
        type: string;
        scheduled_at?: string;
    };
    notification_type?: string;
}
