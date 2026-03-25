export interface CreateAddOnRequestDto {
  name: string;
  price: number;
  category?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpdateAddOnRequestDto extends Partial<CreateAddOnRequestDto> {}

export interface AddOnResponseDto {
  id: string;
  name: string;
  price: number;
  category?: string;
  isActive: boolean;
  displayOrder: number;
}
