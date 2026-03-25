export interface OutletDailySeriesDto {
    date: string;
    outlet_visits: number;
    profile_views: number;
    menu_views: number;
}

export interface OutletDashboardResponseDto {
    outlet: {
        _id: string;
        name: string;
    };
    range: {
        key: string;
        start: string;
        end_exclusive: string;
        days: number;
    };
    series: OutletDailySeriesDto[];
    kpis: {
        outlet_visits: number;
        profile_views: number;
        menu_views: number;
        unique_sessions: number;
        trends: {
            outlet_visits: { pct: number; isUp: boolean } | null;
            profile_views: { pct: number; isUp: boolean } | null;
            menu_views: { pct: number; isUp: boolean } | null;
        };
    };
    funnel: {
        visits: number;
        profile_sessions: number;
        menu_sessions: number;
        visit_to_profile_rate: number;
        visit_to_menu_rate: number;
        profile_to_menu_rate: number;
    };
    audience: {
        new_sessions: number | null;
        returning_sessions: number | null;
        device_breakdown: Record<string, number>;
        source_breakdown: Record<string, number>;
        entry_page_breakdown: Record<string, number>;
    };
}
