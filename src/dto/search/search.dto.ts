export interface SearchNearbyRequestDto {
  latitude: number;
  longitude: number;
  radius?: number;
  limit?: number;
  isVeg?: boolean;
  minRating?: number;
  sortBy?: 'distance' | 'popular' | 'rating' | 'price_low' | 'price_high' | 'popularity';
}

export interface FoodSearchItemDto {
  food_item_id: string;
  name: string;
  description: string;
  image?: string;
  is_veg: boolean;
  price: number;
  outlet: {
    id: string;
    name: string;
    distance: number;
  };
  brand: {
    id: string;
    name: string;
    logo_url?: string;
  };
  rating: number;
  orders: number;
}

export interface NearbyOutletsResponseDto {
  outlets: any[];
  total: number;
  hasMore: boolean;
}
