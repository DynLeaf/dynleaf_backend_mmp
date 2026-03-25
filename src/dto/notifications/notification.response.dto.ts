export interface NotificationResponseDto {
    _id: string;
    title: string;
    message: string;
    type: string;
    reference_id?: string;
    reference_model?: string;
    link?: string;
    image?: string;
    is_read: boolean;
    created_at: string;
    is_push_notification?: boolean;
}

export interface NotificationListResponseDto {
    notifications: NotificationResponseDto[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        pages: number;
    };
    unreadCount: number;
}
