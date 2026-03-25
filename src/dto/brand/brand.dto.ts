export interface CreateBrandRequestDto {
  name: string;
  logo?: string;
  description?: string;
  operationModel: 'corporate' | 'franchise' | 'hybrid';
  cuisines?: string[];
  website?: string;
  instagram?: string;
  email?: string;
}

export interface UpdateBrandRequestDto {
  name?: string;
  logo?: string;
  description?: string;
  operationModel?: 'corporate' | 'franchise' | 'hybrid';
  cuisines?: string[];
  website?: string;
  instagram?: string;
}

export interface UpdateBrandThemeRequestDto {
  primary_color?: string | null;
  secondary_color?: string | null;
}

export interface BrandResponseDto {
  id: string;
  name: string;
  logo_url?: string;
  slug: string;
  status: string;
}

export interface NearbyBrandsRequestDto {
  latitude: string;
  longitude: string;
  radius?: string;
  page?: string;
  limit?: string;
  cuisines?: string;
  priceRange?: string;
  minRating?: string;
  sortBy?: 'distance' | 'rating' | 'popularity';
  isVeg?: string;
}

export interface FeaturedBrandsRequestDto {
  latitude: string;
  longitude: string;
  limit?: string;
}
