export interface ToggleVoteRequestDto {
  voteType: 'up' | 'down';
}

export interface ToggleVoteResponseDto {
  success: boolean;
  action: 'added' | 'removed' | 'changed';
  currentVote: 'up' | 'down' | null;
  upvoteCount: number;
}

export interface UserVoteResponseDto {
  success: boolean;
  voteType: 'up' | 'down' | null;
}

export interface VoteAnalyticsResponseDto {
  success: boolean;
  analytics: {
    upvotes: number;
    downvotes: number;
    total: number;
    ratio: number;
    trend: any[];
  };
}

export interface SubmitVoteReviewRequestDto {
  reviewText: string;
}
