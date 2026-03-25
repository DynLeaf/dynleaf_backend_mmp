export interface DeviceInfoDto {
  deviceId: string;
  deviceName?: string;
  deviceType?: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  os?: string;
  browser?: string;
}

export interface VerifyOtpRequestDto {
  phone: string;
  otp: string;
  deviceInfo: DeviceInfoDto;
}

export interface BrandSummaryDto {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
}

export interface OutletSummaryDto {
  id: string;
  name: string;
  brandId: string;
  status: string;
}

export interface EngagementSummaryDto {
  saved_total: number;
  shared_total: number;
  saved_food_items: number;
  saved_combos: number;
  saved_offers: number;
  shared_food_items: number;
  shared_combos: number;
  shared_offers: number;
  recent_activity: RecentActivityItemDto[];
}

export interface RecentActivityItemDto {
  entity_type: string;
  entity_id: string;
  outlet_id?: string;
  action: 'saved' | 'shared';
  action_at: Date;
}

export interface SavedItemDto {
  entity_type: string;
  entity_id: string;
  outlet_id?: string;
  saved_at: Date;
}

export interface SharedItemDto {
  entity_type: string;
  entity_id: string;
  outlet_id?: string;
  shared_at: Date;
}

export interface AuthUserResponseDto {
  id: string;
  phone?: string;
  email?: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  saved_items: SavedItemDto[];
  shared_items: SharedItemDto[];
  engagement_summary: EngagementSummaryDto;
  roles: Array<{
    scope: string;
    role: string;
    brandId?: string;
    outletId?: string;
    assignedAt: Date;
  }>;
  currentStep: string;
  hasCompletedOnboarding: boolean;
  brands: BrandSummaryDto[];
  outlets: OutletSummaryDto[];
  is_verified: boolean;
  is_active: boolean;
  isNewUser?: boolean;
}

export interface VerifyOtpResponseDto {
  user: AuthUserResponseDto;
}
