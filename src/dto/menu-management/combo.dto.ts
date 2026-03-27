export interface ComboItemRequestDto {
  foodItemId: string;
  quantity: number;
}

export interface ComboCustomItemRequestDto {
  itemName: string;
  itemImage?: string;
  itemQuantity?: number;
}

export interface CreateComboRequestDto {
  comboType?: 'offer' | 'regular';
  name: string;
  description?: string;
  imageUrl?: string;
  items?: ComboItemRequestDto[];
  customItems?: ComboCustomItemRequestDto[];
  price: number;
  originalPrice?: number;
  discountPercentage?: number;
  manualPriceOverride?: boolean;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateComboRequestDto extends Partial<CreateComboRequestDto> {}

export interface ComboResponseDto {
  _id: string;
  id: string;
  combo_type: string;
  name: string;
  slug?: string;
  description?: string;
  image_url?: string;
  items: {
    food_item_id: string;
    name: string;
    image_url?: string;
    food_type?: string;
    quantity: number;
    individual_price: number;
  }[];
  discount_percentage: number;
  original_price: number;
  combo_price: number;
  is_available: boolean;
  food_type?: string;
  avg_rating?: number;
  total_votes?: number;
  order_count?: number;
}
