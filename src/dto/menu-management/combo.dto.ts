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
  id: string;
  comboType: string;
  name: string;
  description?: string;
  imageUrl?: string;
  items: any[];
  customItems: {
    itemName: string;
    itemImage?: string;
    itemQuantity?: number;
  }[];
  discountPercentage: number;
  originalPrice: number;
  price: number;
  manualPriceOverride: boolean;
  isActive: boolean;
  displayOrder: number;
}
