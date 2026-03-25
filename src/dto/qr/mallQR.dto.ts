export interface MallQRConfigResponseDto {
    id: string;
    mall_key: string;
    mall_name: string;
    city?: string;
    state?: string;
    qr_url: string;
    image?: string;
    last_generated_at: Date;
}

export interface UpdateMallQRRequestDto {
    qr_url: string;
    image?: string;
}
