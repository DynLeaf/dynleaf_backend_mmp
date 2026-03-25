export interface SwitchRoleRequestDto {
  scope: string;
  role: string;
  brandId?: string;
  outletId?: string;
}

export interface SwitchRoleResponseDto {
  user: {
    id: string;
    activeRole: {
      scope: string;
      role: string;
      brandId?: string;
      outletId?: string;
    };
  };
}
