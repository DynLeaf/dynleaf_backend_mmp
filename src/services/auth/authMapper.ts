import {
  AuthUserResponseDto,
  BrandSummaryDto,
  OutletSummaryDto,
  EngagementSummaryDto,
  RecentActivityItemDto,
  SavedItemDto,
  SharedItemDto,
} from '../../dto/auth/index.js';
import { UserPlain } from '../../repositories/userRepository.js';
import { BrandSummary } from '../../repositories/brandRepository.js';

interface OutletRaw {
  _id: unknown;
  name: string;
  brand_id?: { _id?: unknown } | unknown;
  status: string;
}

export const mapBrandToDto = (brand: BrandSummary): BrandSummaryDto => ({
  id: brand._id,
  name: brand.name,
  slug: brand.slug,
  logo_url: brand.logo_url,
});

export const mapOutletToDto = (outlet: OutletRaw): OutletSummaryDto => {
  const brandId = typeof outlet.brand_id === 'object' && outlet.brand_id !== null
    ? String((outlet.brand_id as { _id?: unknown })._id || outlet.brand_id)
    : String(outlet.brand_id || '');
  return {
    id: String(outlet._id),
    name: outlet.name,
    brandId,
    status: outlet.status,
  };
};

export const mapSavedItems = (items: UserPlain['saved_items'] = []): SavedItemDto[] =>
  (items || []).map((item) => ({
    entity_type: item.entity_type,
    entity_id: String(item.entity_id),
    outlet_id: item.outlet_id ? String(item.outlet_id) : undefined,
    saved_at: item.saved_at,
  }));

export const mapSharedItems = (items: UserPlain['shared_items'] = []): SharedItemDto[] =>
  (items || []).map((item) => ({
    entity_type: item.entity_type,
    entity_id: String(item.entity_id),
    outlet_id: item.outlet_id ? String(item.outlet_id) : undefined,
    shared_at: item.shared_at,
  }));

export const buildEngagementSummary = (user: UserPlain): EngagementSummaryDto => {
  const savedItems = user.saved_items || [];
  const sharedItems = user.shared_items || [];

  const recentActivity: RecentActivityItemDto[] = [
    ...savedItems.map((item) => ({
      entity_type: item.entity_type,
      entity_id: String(item.entity_id),
      outlet_id: item.outlet_id ? String(item.outlet_id) : undefined,
      action: 'saved' as const,
      action_at: item.saved_at,
    })),
    ...sharedItems.map((item) => ({
      entity_type: item.entity_type,
      entity_id: String(item.entity_id),
      outlet_id: item.outlet_id ? String(item.outlet_id) : undefined,
      action: 'shared' as const,
      action_at: item.shared_at,
    })),
  ]
    .sort((a, b) => new Date(b.action_at).getTime() - new Date(a.action_at).getTime())
    .slice(0, 20);

  return {
    saved_total: savedItems.length,
    shared_total: sharedItems.length,
    saved_food_items: savedItems.filter((i) => i.entity_type === 'food_item').length,
    saved_combos: savedItems.filter((i) => i.entity_type === 'combo').length,
    saved_offers: savedItems.filter((i) => i.entity_type === 'offer').length,
    shared_food_items: sharedItems.filter((i) => i.entity_type === 'food_item').length,
    shared_combos: sharedItems.filter((i) => i.entity_type === 'combo').length,
    shared_offers: sharedItems.filter((i) => i.entity_type === 'offer').length,
    recent_activity: recentActivity,
  };
};

export const mapUserToAuthResponse = (
  user: UserPlain,
  brands: BrandSummary[],
  outlets: OutletRaw[],
  extras?: { isNewUser?: boolean }
): AuthUserResponseDto => {
  const hasCompletedOnboarding =
    user.roles.some((r) => r.role === 'restaurant_owner') &&
    brands.length > 0 &&
    user.currentStep === 'DONE';

  return {
    id: user._id,
    phone: user.phone,
    email: user.email,
    username: user.username,
    full_name: user.full_name,
    avatar_url: user.avatar_url,
    saved_items: mapSavedItems(user.saved_items),
    shared_items: mapSharedItems(user.shared_items),
    engagement_summary: buildEngagementSummary(user),
    roles: user.roles.map((r) => ({
      scope: r.scope,
      role: r.role,
      brandId: r.brandId ? String(r.brandId) : undefined,
      outletId: r.outletId ? String(r.outletId) : undefined,
      assignedAt: r.assignedAt,
    })),
    currentStep: user.currentStep,
    hasCompletedOnboarding,
    brands: brands.map(mapBrandToDto),
    outlets: outlets.map(mapOutletToDto),
    is_verified: user.is_verified,
    is_active: user.is_active,
    isNewUser: extras?.isNewUser,
  };
};

export const checkAccountLock = (
  lockUntil?: Date
): { isLocked: boolean; locked_until?: Date } => {
  if (lockUntil && lockUntil > new Date()) {
    return { isLocked: true, locked_until: lockUntil };
  }
  return { isLocked: false };
};
