export interface OutletQRConfigResponseDto {
    id: string;
    outlet_id: string;
    table_count: number;
    last_generated_at: Date;
}

export interface UpdateOutletQRRequestDto {
    table_count: number;
}
