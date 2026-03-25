export interface SessionResponseDto {
  id: string;
  deviceInfo: {
    device_id: string;
    device_name?: string;
    device_type: string;
    os?: string;
    browser?: string;
    ip_address: string;
  };
  lastUsedAt: Date;
  createdAt: Date;
  isCurrent: boolean;
}

export interface GetSessionsResponseDto {
  sessions: SessionResponseDto[];
}

export interface AdminLoginRequestDto {
  email: string;
  password: string;
}

export interface AdminUserDto {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

export interface AdminLoginResponseDto {
  user: AdminUserDto;
}

export interface GoogleExchangeRequestDto {
  code: string;
  redirect_uri?: string;
  deviceInfo?: {
    deviceId?: string;
    deviceName?: string;
    deviceType?: string;
    os?: string;
    browser?: string;
  };
}
