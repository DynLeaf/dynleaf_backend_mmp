export interface FoodAnalyticsResponseDto {
    window: {
        range: string;
        start: Date;
        end: Date;
    };
    totalViews: number;
    totalShares: number;
    topViewed: {
        id: string;
        name: string;
        views: number;
    }[];
    topVoted: {
        id: string;
        name: string;
        votes: number;
    }[];
}
