export interface OnboardingListRequest {
    page: number;
    limit: number;
    statusFilter?: string;
}

export interface OnboardingRequestResponse {
    _id: string;
    user_id: {
        _id?: string;
        phone?: string;
        email?: string;
        name?: string;
    };
    brand_id: {
        _id?: string;
        name?: string;
        logo?: string;
    };
    outlet_id: {
        _id: string;
        name: string;
        address: {
            city?: string;
            full?: string;
        };
    };
    status: string;
    submitted_at?: Date;
    menu_strategy: string;
    rejection_reason?: string;
}

export interface OnboardingDetailResponse {
    brand_id: {
        _id?: string;
        name?: string;
        logo?: string;
        description?: string;
        cuisine_types?: string[];
        verification_status?: string;
    };
    outlet_id: {
        _id: string;
        name: string;
        address?: any;
        contact?: any;
        approval_status?: string;
        status?: string;
    };
    compliance?: {
        _id: string;
        fssai_number?: string;
        gst_number?: string;
        gst_percentage?: number;
        is_verified?: boolean;
        verified_at?: Date;
    } | null;
    approved_at?: Date;
    rejected_at?: Date;
}
