export interface FollowStatusResponseDto {
  is_following: boolean;
}

export interface FollowCountResponseDto {
  count: number;
}

export interface FollowedOutletDto {
  _id: string; // Follow record ID
  user: string;
  outlet: {
    _id: string;
    name: string;
    banner_image_url?: string;
    cover_image_url?: string;
    location?: Record<string, unknown>;
    address?: string;
    brand?: {
      _id: string;
      logo_url?: string;
      name: string;
      cuisines?: string[];
    };
  };
  created_at: Date;
}

export interface GetFollowedOutletsResponseDto {
  follows: FollowedOutletDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}
