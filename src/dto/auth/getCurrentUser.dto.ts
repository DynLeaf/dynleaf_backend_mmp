import { AuthUserResponseDto } from './verifyOtp.dto.js';

export interface GetCurrentUserResponseDto {
  user: AuthUserResponseDto & {
    bio?: string;
    activeRole?: Record<string, unknown> | null;
    onboardingStatus: 'pending_details' | 'pending_approval' | 'approved' | 'rejected';
    permissions: string[];
    last_login_at?: Date;
    following_count: number;
  };
}
