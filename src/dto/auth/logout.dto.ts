export interface LogoutRequestDto {
  deviceId?: string;
  allDevices?: boolean;
}

export interface LogoutResponseDto {
  message: string;
}
