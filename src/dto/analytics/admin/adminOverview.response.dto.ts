export interface AdminOverviewResponseDto {
    window: {
        range: string;
        start: Date;
        end: Date;
    };
    food: {
        topViewed: { id: string; name: string; views: number } | null;
        mostVoted: { id: string; name: string; votes: number } | null;
        totalViews: number;
    };
    outlets: {
        topPerforming: { id: string; name: string; views: number } | null;
        totalViews: number;
        averageViewsPerOutlet: number;
    };
    promotions: {
        activeCount: number;
        topPerforming: { id: string; title: string; impressions: number; clicks: number } | null;
        totalImpressions: number;
        totalClicks: number;
    };
    offers: {
        activeCount: number;
        topPerforming: { id: string; title: string; views: number; clicks: number; codeCopies: number } | null;
        totalViews: number;
        totalClicks: number;
        totalCodeCopies: number;
    };
    users: {
        newUsers: number;
        activeUsers: number;
        returningUsers: number;
    };
    growth: {
        totalOutlets: number;
        newOutlets: number;
        activeOutlets: number;
        inactiveOutlets: number;
        outletGrowthTrendPct: number | null;
    };
    engagement: {
        totalViews: number;
        totalVotes: number;
        totalShares: number;
        engagementRatePct: number;
        engagementTrendPct: number | null;
    };
    discovery: {
        qrMenuScans: number;
        mallQrScans: number;
        searchAppearances: number;
        nearbyDiscoveries: number;
        trendingFoodItem: { id: string; name: string; views: number } | null;
    };
}
