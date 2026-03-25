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
  id: string;
  categoryId: string | null;
  item_number?: string;
  addonIds: string[];
  name: string;
  description?: string;
  itemType: string;
  isVeg: boolean;
  basePrice: number;
  taxPercentage: number;
  imageUrl?: string;
  isActive: boolean;
  isAvailable: boolean;
  tags: string[];
  variants: { size: string; price: number }[];
  displayOrder: number;
  preparationTime?: string;
  calories?: string;
  spiceLevel?: string;
  allergens?: string[];
  isFeatured: boolean;
  isRecommended: boolean;
  discountPercentage: number;
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
