export interface BrandListRequest {
    page: number;
    limit: number;
    search?: string;
    verification_status?: string;
    operating_mode?: string;
    is_featured?: string;
}

export interface BrandUpdateListRequest {
    page: number;
    limit: number;
    status?: string;
}
