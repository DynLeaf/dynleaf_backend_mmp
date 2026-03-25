export interface UpdateProfileRequestDto {
  full_name?: string;
  email?: string;
  phone?: string;
  bio?: string;
  avatar_url?: string;
  avatarUrl?: string; // Legacy support
  imageUrl?: string;  // Legacy support
  url?: string;       // Legacy support
}

export interface UploadAvatarRequestDto {
  image?: string;
  imageUrl?: string; // Legacy support
  url?: string;      // Legacy support
}

export interface UserProfileResponseDto {
  id: string;
  full_name: string;
  email?: string;
  phone: string;
  bio?: string;
  avatar_url?: string;
  roles: Array<{ scope: string; role: string; brandId?: string; outletId?: string }>;
  following_count: number;
  engagement_summary: {
    saved_total: number;
    shared_total: number;
    saved_food_items: number;
    saved_combos: number;
    saved_offers: number;
    shared_food_items: number;
    shared_combos: number;
    shared_offers: number;
    recent_activity: Array<{
      entity_type: string;
      entity_id: string;
      outlet_id?: string;
      action: 'saved' | 'shared';
      action_at: Date;
    }>;
  };
}
