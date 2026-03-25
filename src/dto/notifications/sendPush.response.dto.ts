export interface SendPushResponseDto {
    _id: string;
    status: string;
    total_targeted: number;
    successfully_sent: number;
    failed: number;
    users_with_tokens: number;
    users_without_tokens: number;
    user_details: Array<{
        _id: string;
        name: string;
        phone: string;
        email: string;
        tokens_count: number;
    }>;
    message: string;
}
