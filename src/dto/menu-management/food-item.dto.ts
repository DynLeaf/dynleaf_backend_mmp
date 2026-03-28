export interface CreateFoodItemRequestDto {
  name: string;
  itemNumber?: string;
  description?: string;
  categoryId: string;
  itemType?: 'food' | 'beverage';
  isVeg?: boolean;
  taxPercentage?: number;
  imageUrl?: string;
  isAvailable?: boolean;
  addonIds?: string[];
  tags?: string[];
  variants?: { size: string; price: number }[];
  preparationTime?: string;
  calories?: string;
  spiceLevel?: string;
  allergens?: string[];
  isFeatured?: boolean;
  discountPercentage?: number;
  isRecommended?: boolean;
  price?: number;
  basePrice?: number;
  displayOrder?: number;
  isActive?: boolean;
  priceDisplayType?: 'fixed' | 'range' | 'starting';
}

export interface UpdateFoodItemRequestDto extends Partial<CreateFoodItemRequestDto> {
  base_price?: number;
  price_display_type?: 'fixed' | 'range' | 'starting';
}

export interface FoodItemResponseDto {
  _id: string;
  name: string;
  image_url?: string | null;
  images: string[];
  item_type: string;
  food_type: string;
  is_veg: boolean;
  price: number;
  discount_percentage: number;
  is_available: boolean;
  stock_status: string;
  allergens: string[];
  ingredients: string[];
  cuisines: string[];
  tags: string[];
  avg_rating: number;
  total_votes: number;
  upvote_count: number;
  downvote_count: number;
  post_count: number;
  order_count: number;
  is_featured: boolean;
  is_recommended: boolean;
  is_bestseller: boolean;
  is_signature: boolean;
  is_new: boolean;
  addons: any[];
  variants: any[];
  user_vote_type: string | null;
  price_display_type: string;
}

export interface FoodItemListResponseDto {
  items: FoodItemResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface BulkUpdateFoodItemsRequestDto {
  itemIds: string[];
  updates: Partial<CreateFoodItemRequestDto>;
}
