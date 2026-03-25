import mongoose from 'mongoose';
import * as outletAnalyticsSummaryRepo from '../repositories/analytics/outletAnalyticsSummaryRepository.js';
import * as foodItemAnalyticsSummaryRepo from '../repositories/analytics/foodItemAnalyticsSummaryRepository.js';
import * as outletRepo from '../repositories/outletRepository.js';
import * as foodItemRepo from '../repositories/foodItemRepository.js';

export const getOutletAnalyticsOverview = async (start: Date, end: Date) => {
    const aggregation = await outletAnalyticsSummaryRepo.aggregateEvents([
        {
            $match: {
                date: { $gte: start, $lt: end },
            },
        },
        {
            $group: {
                _id: null,
                total_outlet_views: { $sum: { $add: ['$metrics.profile_views', '$metrics.menu_views'] } },
                total_menu_views: { $sum: '$metrics.menu_views' },
                total_qr_menu_views: { $sum: '$metrics.qr_menu_views' },
                total_qr_profile_views: { $sum: '$metrics.qr_profile_views' },
            },
        },
    ]);

    return aggregation[0] || {
        total_outlet_views: 0,
        total_menu_views: 0,
        total_qr_menu_views: 0,
        total_qr_profile_views: 0,
    };
};

export const getOutletAnalyticsList = async (start: Date, end: Date, skip: number, limitNum: number) => {
    const outletAggregation = await outletAnalyticsSummaryRepo.aggregateEvents([
        {
            $match: {
                date: { $gte: start, $lt: end },
            },
        },
        {
            $group: {
                _id: '$outlet_id',
                total_views: { $sum: { $add: ['$metrics.profile_views', '$metrics.menu_views'] } },
                profile_views: { $sum: '$metrics.profile_views' },
                menu_views: { $sum: '$metrics.menu_views' },
                qr_menu_views: { $sum: '$metrics.qr_menu_views' },
                qr_profile_views: { $sum: '$metrics.qr_profile_views' },
                unique_sessions: { $sum: '$metrics.unique_sessions' },
            },
        },
        { $sort: { total_views: -1 } },
    ]);

    const total = outletAggregation.length;
    const paginatedData = outletAggregation.slice(skip, skip + limitNum);

    const outletIds = paginatedData.map((item: any) => String(item._id));
    const outlets = await outletRepo.findByIdsLean(outletIds);
    const outletMap = new Map((outlets as any[]).map((o: any) => [String(o._id), o]));

    const result = paginatedData.map((item: any) => ({
        outlet_id: item._id,
        outlet: outletMap.get(String(item._id)),
        analytics: {
            total_views: item.total_views,
            profile_views: item.profile_views,
            menu_views: item.menu_views,
            qr_menu_views: item.qr_menu_views,
            qr_profile_views: item.qr_profile_views,
            unique_sessions: item.unique_sessions,
        },
    }));

    return { result, total };
};

export const getOutletAnalyticsSummary = async (id: string, start: Date, end: Date) => {
    const outlet = await outletRepo.findByIdLean(id);
    if (!outlet) return null;

    const aggregation = await outletAnalyticsSummaryRepo.aggregateEvents([
        {
            $match: {
                outlet_id: new mongoose.Types.ObjectId(id),
                date: { $gte: start, $lt: end },
            },
        },
        {
            $group: {
                _id: null,
                total_menu_views: { $sum: '$metrics.menu_views' },
                total_menu_views_qr: { $sum: '$metrics.qr_menu_views' },
                total_profile_views: { $sum: '$metrics.profile_views' },
                total_profile_views_qr: { $sum: '$metrics.qr_profile_views' },
                unique_sessions: { $sum: '$metrics.unique_sessions' },

                profile_view_sources_qr_scan: { $sum: '$metrics.profile_view_sources.qr_scan' },
                profile_view_sources_whatsapp: { $sum: '$metrics.profile_view_sources.whatsapp' },
                profile_view_sources_link: { $sum: '$metrics.profile_view_sources.link' },
                profile_view_sources_telegram: { $sum: '$metrics.profile_view_sources.telegram' },
                profile_view_sources_twitter: { $sum: '$metrics.profile_view_sources.twitter' },
                profile_view_sources_share: { $sum: '$metrics.profile_view_sources.share' },
                profile_view_sources_search: { $sum: '$metrics.profile_view_sources.search' },
                profile_view_sources_home: { $sum: '$metrics.profile_view_sources.home' },
                profile_view_sources_menu_page: { $sum: '$metrics.profile_view_sources.menu_page' },
                profile_view_sources_direct_url: { $sum: '$metrics.profile_view_sources.direct_url' },
                profile_view_sources_other: { $sum: '$metrics.profile_view_sources.other' },

                menu_view_sources_qr_scan: { $sum: '$metrics.menu_view_sources.qr_scan' },
                menu_view_sources_whatsapp: { $sum: '$metrics.menu_view_sources.whatsapp' },
                menu_view_sources_link: { $sum: '$metrics.menu_view_sources.link' },
                menu_view_sources_telegram: { $sum: '$metrics.menu_view_sources.telegram' },
                menu_view_sources_twitter: { $sum: '$metrics.menu_view_sources.twitter' },
                menu_view_sources_share: { $sum: '$metrics.menu_view_sources.share' },
                menu_view_sources_search: { $sum: '$metrics.menu_view_sources.search' },
                menu_view_sources_home: { $sum: '$metrics.menu_view_sources.home' },
                menu_view_sources_profile_page: { $sum: '$metrics.menu_view_sources.profile_page' },
                menu_view_sources_direct_url: { $sum: '$metrics.menu_view_sources.direct_url' },
                menu_view_sources_other: { $sum: '$metrics.menu_view_sources.other' },
            },
        },
    ]);

    const summary = aggregation[0] || {
        total_menu_views: 0,
        total_menu_views_qr: 0,
        total_profile_views: 0,
        total_profile_views_qr: 0,
        unique_sessions: 0,
        profile_view_sources_qr_scan: 0,
        profile_view_sources_whatsapp: 0,
        profile_view_sources_link: 0,
        profile_view_sources_telegram: 0,
        profile_view_sources_twitter: 0,
        profile_view_sources_share: 0,
        profile_view_sources_search: 0,
        profile_view_sources_home: 0,
        profile_view_sources_menu_page: 0,
        profile_view_sources_direct_url: 0,
        profile_view_sources_other: 0,
        menu_view_sources_qr_scan: 0,
        menu_view_sources_whatsapp: 0,
        menu_view_sources_link: 0,
        menu_view_sources_telegram: 0,
        menu_view_sources_twitter: 0,
        menu_view_sources_share: 0,
        menu_view_sources_search: 0,
        menu_view_sources_home: 0,
        menu_view_sources_profile_page: 0,
        menu_view_sources_direct_url: 0,
        menu_view_sources_other: 0,
    };

    return { outlet, summary };
};

export const getOutletFoodItemsAnalytics = async (id: string, start: Date, end: Date, skip: number, limitNum: number) => {
    const foodItemsAggregation = await foodItemAnalyticsSummaryRepo.aggregateEvents([
        {
            $match: {
                outlet_id: new mongoose.Types.ObjectId(id),
                date: { $gte: start, $lt: end },
            },
        },
        {
            $group: {
                _id: '$food_item_id',
                total_views: { $sum: '$metrics.views' },
                views_from_home: {
                    $sum: { $cond: [{ $gt: ['$source_breakdown.home', 0] }, '$source_breakdown.home', 0] },
                },
                views_from_homepage_trending: {
                    $sum: { $cond: [{ $gt: ['$source_breakdown.homepage_trending', 0] }, '$source_breakdown.homepage_trending', 0] },
                },
                views_from_menu: {
                    $sum: { $cond: [{ $gt: ['$source_breakdown.menu', 0] }, '$source_breakdown.menu', 0] },
                },
            },
        },
        {
            $addFields: {
                views_from_home_total: { $add: ['$views_from_home', '$views_from_homepage_trending'] },
            },
        },
        { $sort: { total_views: -1 } },
    ]);

    const total = foodItemsAggregation.length;
    const paginatedData = foodItemsAggregation.slice(skip, skip + limitNum);

    const foodItemIds = paginatedData.map((item: any) => String(item._id));
    const foodItems = await foodItemRepo.findByIdsLean(foodItemIds);
    const foodItemMap = new Map(foodItems.map((f: any) => [String(f._id), f]));

    const result = paginatedData.map((item: any) => ({
        food_item_id: item._id,
        food_item: foodItemMap.get(String(item._id)),
        analytics: {
            total_views: item.total_views,
            views_from_home: item.views_from_home_total,
            views_from_menu: item.views_from_menu,
        },
    }));

    return { result, total };
};

export const getFoodOverview = async (start: Date, end: Date) => {
    const topViewed = await foodItemAnalyticsSummaryRepo.aggregateEvents([
        { $match: { date: { $gte: start, $lt: end } } },
        { $group: { _id: '$food_item_id', totalViews: { $sum: '$metrics.views' }, outlet_id: { $first: '$outlet_id' } } },
        { $sort: { totalViews: -1 } },
        { $limit: 1 },
    ]);

    if (topViewed.length === 0) return null;

    const topItem = topViewed[0];
    const foodItem = await foodItemRepo.findByIdLean(String(topItem._id)) as any;
    const outlet = await outletRepo.findByIdLean(String(topItem.outlet_id)) as any;

    return {
        food_item_id: topItem._id,
        name: foodItem?.name || 'Unknown',
        image_url: foodItem?.image_url,
        outlet_name: outlet?.name || 'Unknown',
        total_views: topItem.totalViews,
    };
};

export const getFoodSummaryStats = async (start: Date, end: Date) => {
    const totalViewsAgg = await foodItemAnalyticsSummaryRepo.aggregateEvents([
        { $match: { date: { $gte: start, $lt: end } } },
        { $group: { _id: null, totalViews: { $sum: '$metrics.views' } } },
    ]);
    const totalViews = totalViewsAgg[0]?.totalViews || 0;

    const topViewedAgg = await foodItemAnalyticsSummaryRepo.aggregateEvents([
        { $match: { date: { $gte: start, $lt: end } } },
        { $group: { _id: '$food_item_id', totalViews: { $sum: '$metrics.views' }, outlet_id: { $first: '$outlet_id' } } },
        { $sort: { totalViews: -1 } },
        { $limit: 1 },
    ]);

    let top_viewed_item = null;
    if (topViewedAgg.length > 0) {
        const item = topViewedAgg[0];
        const foodItem = await foodItemRepo.findByIdLean(String(item._id)) as any;
        const outlet = await outletRepo.findByIdLean(String(item.outlet_id)) as any;
        top_viewed_item = {
            name: foodItem?.name || 'Unknown',
            image_url: foodItem?.image_url,
            view_count: item.totalViews,
            outlet_name: outlet?.name || 'Unknown',
        };
    }

    const mostVotedAgg = await foodItemAnalyticsSummaryRepo.aggregateEvents([
        { $match: { date: { $gte: start, $lt: end } } },
        { $group: { _id: '$food_item_id', totalViews: { $sum: '$metrics.views' }, voteCount: { $max: '$vote_count' }, outlet_id: { $first: '$outlet_id' } } },
        { $sort: { voteCount: -1 } },
        { $limit: 1 },
    ]);

    let most_voted_item = null;
    if (mostVotedAgg.length > 0) {
        const item = mostVotedAgg[0];
        const foodItem = await foodItemRepo.findByIdLean(String(item._id)) as any;
        const outlet = await outletRepo.findByIdLean(String(item.outlet_id)) as any;
        most_voted_item = {
            name: foodItem?.name || 'Unknown',
            image_url: foodItem?.image_url,
            vote_count: item.voteCount || 0,
            view_count: item.totalViews,
            outlet_name: outlet?.name || 'Unknown',
        };
    }

    return { total_food_views: totalViews, top_viewed_item, most_voted_item };
};

export const getTopViewedFood = async (start: Date, end: Date, skip: number, limitNum: number) => {
    const items = await foodItemAnalyticsSummaryRepo.aggregateEvents([
        { $match: { date: { $gte: start, $lt: end } } },
        { $group: { _id: '$food_item_id', totalViews: { $sum: '$metrics.views' }, voteCount: { $max: '$vote_count' }, outlet_id: { $first: '$outlet_id' } } },
        { $sort: { totalViews: -1 } },
        { $facet: { items: [{ $skip: skip }, { $limit: limitNum }], totalCount: [{ $count: 'count' }] } },
    ]);

    const results = items[0]?.items || [];
    const totalCount = items[0]?.totalCount[0]?.count || 0;

    const populatedResults = await Promise.all(
        results.map(async (item: any) => {
            const foodItem = await foodItemRepo.findByIdLean(String(item._id)) as any;
            const outlet = await outletRepo.findByIdLean(String(item.outlet_id)) as any;
            return {
                food_item_id: item._id,
                name: foodItem?.name || 'Unknown',
                image_url: foodItem?.image_url,
                outlet_name: outlet?.name || 'Unknown',
                view_count: item.totalViews,
                vote_count: item.voteCount || 0,
            };
        })
    );

    return { items: populatedResults, totalCount };
};

export const getMostVotedFood = async (start: Date, end: Date, skip: number, limitNum: number) => {
    const items = await foodItemAnalyticsSummaryRepo.aggregateEvents([
        { $match: { date: { $gte: start, $lt: end } } },
        { $group: { _id: '$food_item_id', totalViews: { $sum: '$metrics.views' }, voteCount: { $max: '$vote_count' }, outlet_id: { $first: '$outlet_id' } } },
        { $sort: { voteCount: -1, totalViews: -1 } },
        { $facet: { items: [{ $skip: skip }, { $limit: limitNum }], totalCount: [{ $count: 'count' }] } },
    ]);

    const results = items[0]?.items || [];
    const totalCount = items[0]?.totalCount[0]?.count || 0;

    const populatedResults = await Promise.all(
        results.map(async (item: any) => {
            const foodItem = await foodItemRepo.findByIdLean(String(item._id)) as any;
            const outlet = await outletRepo.findByIdLean(String(item.outlet_id)) as any;
            return {
                food_item_id: item._id,
                name: foodItem?.name || 'Unknown',
                image_url: foodItem?.image_url,
                outlet_name: outlet?.name || 'Unknown',
                view_count: item.totalViews,
                vote_count: item.voteCount || 0,
            };
        })
    );

    return { items: populatedResults, totalCount };
};
