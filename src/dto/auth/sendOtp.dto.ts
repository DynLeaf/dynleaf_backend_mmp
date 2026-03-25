export interface SendOtpRequestDto {
  phone: string;
}

export interface SendOtpResponseDto {
  expiresIn: number;
}
