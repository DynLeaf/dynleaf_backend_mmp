import { Request, Response } from 'express';
import { sendError, sendSuccess } from '../utils/response.js';
import { resolveAnalyticsWindow } from '../utils/analyticsRange.js';
import { FoodItemAnalyticsSummary } from '../models/FoodItemAnalyticsSummary.js';
import { FoodItemAnalyticsEvent } from '../models/FoodItemAnalyticsEvent.js';
import { OutletAnalyticsSummary } from '../models/OutletAnalyticsSummary.js';
import { OutletAnalyticsEvent } from '../models/OutletAnalyticsEvent.js';
import { PromotionAnalyticsSummary } from '../models/PromotionAnalyticsSummary.js';
import { PromotionEvent } from '../models/PromotionEvent.js';
import { FeaturedPromotion } from '../models/FeaturedPromotion.js';
import { Offer } from '../models/Offer.js';
import { OfferEvent } from '../models/OfferEvent.js';
import { DishVote } from '../models/DishVote.js';
import { FoodItem } from '../models/FoodItem.js';
import { Outlet } from '../models/Outlet.js';
import { User } from '../models/User.js';
import { StoryView } from '../models/StoryView.js';

function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export const getAdminAnalyticsOverview = async (req: Request, res: Response) => {
  try {
    const window = resolveAnalyticsWindow({
      range: req.query.range,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    });

    const [
      foodAgg,
      foodAggPrev,
      outletAgg,
      outletAggPrev,
      promoAgg,
      promoAggPrev,
      votesAgg,
      votesAggPrev,
      sharesNow,
      sharesPrev,
      usersNewNow,
      usersNewPrev,
      activeUsersNow,
      activeUsersPrev,
      totalOutlets,
      newOutletsNow,
      newOutletsPrev,
      activeOutlets,
      inactiveOutlets,
      qrMenuScansNow,
      qrMenuScansPrev,
      searchImpressionsNow,
      searchImpressionsPrev,
      nearbyDiscoveriesNow,
      nearbyDiscoveriesPrev,
      activePromotionsCount,
      offersAgg,
      offersAggPrev,
      activeOffersCount,
    ] = await Promise.all([
      // Food views totals + top viewed items
      FoodItemAnalyticsSummary.aggregate([
        { $match: { date: { $gte: window.start, $lte: window.end } } },
        {
          $group: {
            _id: '$food_item_id',
            views: { $sum: '$metrics.views' },
          },
        },
        { $sort: { views: -1 } },
        { $limit: 10 },
      ]),
      FoodItemAnalyticsSummary.aggregate([
        { $match: { date: { $gte: window.prevStart, $lte: window.prevEnd } } },
        {
          $group: {
            _id: '$food_item_id',
            views: { $sum: '$metrics.views' },
          },
        },
        { $sort: { views: -1 } },
        { $limit: 10 },
      ]),

      // Outlet totals + top outlets (using profile_views + menu_views as overall views)
      OutletAnalyticsSummary.aggregate([
        { $match: { date: { $gte: window.start, $lte: window.end } } },
        {
          $group: {
            _id: '$outlet_id',
            profile_views: { $sum: '$metrics.profile_views' },
            menu_views: { $sum: '$metrics.menu_views' },
          },
        },
        {
          $addFields: {
            total_views: { $add: ['$profile_views', '$menu_views'] },
          },
        },
        { $sort: { total_views: -1 } },
        { $limit: 10 },
      ]),
      OutletAnalyticsSummary.aggregate([
        { $match: { date: { $gte: window.prevStart, $lte: window.prevEnd } } },
        {
          $group: {
            _id: '$outlet_id',
            profile_views: { $sum: '$metrics.profile_views' },
            menu_views: { $sum: '$metrics.menu_views' },
          },
        },
        {
          $addFields: {
            total_views: { $add: ['$profile_views', '$menu_views'] },
          },
        },
        { $sort: { total_views: -1 } },
        { $limit: 10 },
      ]),

      // Promotion totals + top promotions
      PromotionAnalyticsSummary.aggregate([
        { $match: { date: { $gte: window.start, $lte: window.end } } },
        {
          $group: {
            _id: '$promotion_id',
            impressions: { $sum: '$metrics.impressions' },
            clicks: { $sum: '$metrics.clicks' },
            menu_views: { $sum: '$metrics.menu_views' },
          },
        },
        {
          $addFields: {
            score: { $add: ['$impressions', { $multiply: ['$clicks', 3] }] },
          },
        },
        { $sort: { score: -1 } },
        { $limit: 10 },
      ]),
      PromotionAnalyticsSummary.aggregate([
        { $match: { date: { $gte: window.prevStart, $lte: window.prevEnd } } },
        {
          $group: {
            _id: '$promotion_id',
            impressions: { $sum: '$metrics.impressions' },
            clicks: { $sum: '$metrics.clicks' },
            menu_views: { $sum: '$metrics.menu_views' },
          },
        },
        {
          $addFields: {
            score: { $add: ['$impressions', { $multiply: ['$clicks', 3] }] },
          },
        },
        { $sort: { score: -1 } },
        { $limit: 10 },
      ]),

      // Votes (DishVote)
      DishVote.aggregate([
        { $match: { created_at: { $gte: window.start, $lte: window.end } } },
        {
          $group: {
            _id: '$food_item_id',
            votes: { $sum: 1 },
          },
        },
        { $sort: { votes: -1 } },
        { $limit: 10 },
      ]),
      DishVote.aggregate([
        { $match: { created_at: { $gte: window.prevStart, $lte: window.prevEnd } } },
        {
          $group: {
            _id: '$food_item_id',
            votes: { $sum: 1 },
          },
        },
        { $sort: { votes: -1 } },
        { $limit: 10 },
      ]),

      // Shares (FoodItemAnalyticsEvent)
      FoodItemAnalyticsEvent.countDocuments({
        event_type: 'share',
        timestamp: { $gte: window.start, $lte: window.end },
      }),
      FoodItemAnalyticsEvent.countDocuments({
        event_type: 'share',
        timestamp: { $gte: window.prevStart, $lte: window.prevEnd },
      }),

      // Users
      User.countDocuments({ created_at: { $gte: window.start, $lte: window.end } }),
      User.countDocuments({ created_at: { $gte: window.prevStart, $lte: window.prevEnd } }),
      User.countDocuments({ last_active_at: { $gte: window.start, $lte: window.end } }),
      User.countDocuments({ last_active_at: { $gte: window.prevStart, $lte: window.prevEnd } }),

      // Outlets (growth)
      Outlet.countDocuments({}),
      Outlet.countDocuments({ created_at: { $gte: window.start, $lte: window.end } }),
      Outlet.countDocuments({ created_at: { $gte: window.prevStart, $lte: window.prevEnd } }),
      Outlet.countDocuments({ status: 'ACTIVE' }),
      Outlet.countDocuments({ status: { $ne: 'ACTIVE' } }),

      // Discovery
      OutletAnalyticsEvent.countDocuments({
        event_type: 'menu_view',
        source: { $in: ['qr', 'QR', 'qrcode', 'qr_code'] },
        timestamp: { $gte: window.start, $lte: window.end },
      }),
      OutletAnalyticsEvent.countDocuments({
        event_type: 'menu_view',
        source: { $in: ['qr', 'QR', 'qrcode', 'qr_code'] },
        timestamp: { $gte: window.prevStart, $lte: window.prevEnd },
      }),
      FoodItemAnalyticsEvent.countDocuments({
        event_type: 'item_impression',
        source: 'search',
        timestamp: { $gte: window.start, $lte: window.end },
      }),
      FoodItemAnalyticsEvent.countDocuments({
        event_type: 'item_impression',
        source: 'search',
        timestamp: { $gte: window.prevStart, $lte: window.prevEnd },
      }),
      OutletAnalyticsEvent.countDocuments({
        source: { $in: ['nearby', 'map', 'maps'] },
        timestamp: { $gte: window.start, $lte: window.end },
      }),
      OutletAnalyticsEvent.countDocuments({
        source: { $in: ['nearby', 'map', 'maps'] },
        timestamp: { $gte: window.prevStart, $lte: window.prevEnd },
      }),

      // Active promotions right now
      FeaturedPromotion.countDocuments({
        is_active: true,
        'scheduling.start_date': { $lte: new Date() },
        'scheduling.end_date': { $gte: new Date() },
      }),

      // Offers analytics
      OfferEvent.aggregate([
        { $match: { timestamp: { $gte: window.start, $lte: window.end } } },
        {
          $group: {
            _id: '$offer_id',
            views: {
              $sum: { $cond: [{ $in: ['$event_type', ['impression', 'view']] }, 1, 0] },
            },
            clicks: {
              $sum: { $cond: [{ $eq: ['$event_type', 'click'] }, 1, 0] },
            },
            code_copies: {
              $sum: { $cond: [{ $eq: ['$event_type', 'code_copy'] }, 1, 0] },
            },
          },
        },
        {
          $addFields: {
            score: { $add: ['$views', { $multiply: ['$clicks', 2] }, { $multiply: ['$code_copies', 3] }] },
          },
        },
        { $sort: { score: -1 } },
        { $limit: 10 },
      ]),
      OfferEvent.aggregate([
        { $match: { timestamp: { $gte: window.prevStart, $lte: window.prevEnd } } },
        {
          $group: {
            _id: '$offer_id',
            views: {
              $sum: { $cond: [{ $in: ['$event_type', ['impression', 'view']] }, 1, 0] },
            },
            clicks: {
              $sum: { $cond: [{ $eq: ['$event_type', 'click'] }, 1, 0] },
            },
            code_copies: {
              $sum: { $cond: [{ $eq: ['$event_type', 'code_copy'] }, 1, 0] },
            },
          },
        },
        {
          $addFields: {
            score: { $add: ['$views', { $multiply: ['$clicks', 2] }, { $multiply: ['$code_copies', 3] }] },
          },
        },
        { $sort: { score: -1 } },
        { $limit: 10 },
      ]),

      // Active offers count
      Offer.countDocuments({
        is_active: true,
        valid_from: { $lte: new Date() },
        valid_till: { $gte: new Date() },
      } as any),
    ]);

    const topFoodIds = foodAgg.map((d: any) => d._id);
    const topOutletIds = outletAgg.map((d: any) => d._id);
    const topPromoIds = promoAgg.map((d: any) => d._id);
    const topVotedFoodIds = votesAgg.map((d: any) => d._id);
    const topOfferIds = offersAgg.map((d: any) => d._id);

    const [foodDocs, outletDocs, promoDocs, votedFoodDocs, offerDocs] = await Promise.all([
      FoodItem.find({ _id: { $in: topFoodIds } }, { name: 1 }).lean(),
      Outlet.find({ _id: { $in: topOutletIds } }, { name: 1 }).lean(),
      FeaturedPromotion.find({ _id: { $in: topPromoIds } }, { 'display_data.banner_text': 1, 'display_data.link_url': 1 }).lean(),
      FoodItem.find({ _id: { $in: topVotedFoodIds } }, { name: 1 }).lean(),
      Offer.find({ _id: { $in: topOfferIds } }, { title: 1 }).lean(),
    ]);

    const foodNameById = new Map(foodDocs.map((f: any) => [String(f._id), f.name]));
    const outletNameById = new Map(outletDocs.map((o: any) => [String(o._id), o.name]));
    const promoTitleById = new Map(promoDocs.map((p: any) => [String(p._id), p.display_data?.banner_text || p.display_data?.link_url || 'Promotion']));
    const votedFoodNameById = new Map(votedFoodDocs.map((f: any) => [String(f._id), f.name]));
    const offerTitleById = new Map(offerDocs.map((o: any) => [String(o._id), o.title]));

    const totalFoodViewsNow = foodAgg.reduce((sum: number, d: any) => sum + (d.views || 0), 0);
    const totalFoodViewsPrev = foodAggPrev.reduce((sum: number, d: any) => sum + (d.views || 0), 0);

    const totalOutletViewsNow = outletAgg.reduce((sum: number, d: any) => sum + (d.total_views || 0), 0);
    const totalOutletViewsPrev = outletAggPrev.reduce((sum: number, d: any) => sum + (d.total_views || 0), 0);

    const totalPromoImpressionsNow = promoAgg.reduce((sum: number, d: any) => sum + (d.impressions || 0), 0);
    const totalPromoClicksNow = promoAgg.reduce((sum: number, d: any) => sum + (d.clicks || 0), 0);
    const totalPromoImpressionsPrev = promoAggPrev.reduce((sum: number, d: any) => sum + (d.impressions || 0), 0);
    const totalPromoClicksPrev = promoAggPrev.reduce((sum: number, d: any) => sum + (d.clicks || 0), 0);

    const totalVotesNow = votesAgg.reduce((sum: number, d: any) => sum + (d.votes || 0), 0);
    const totalVotesPrev = votesAggPrev.reduce((sum: number, d: any) => sum + (d.votes || 0), 0);

    const totalViewsNow = totalFoodViewsNow + totalOutletViewsNow + totalPromoImpressionsNow;
    const totalViewsPrev = totalFoodViewsPrev + totalOutletViewsPrev + totalPromoImpressionsPrev;

    const totalEngagementNow = totalViewsNow + totalVotesNow + sharesNow;
    const totalEngagementPrev = totalViewsPrev + totalVotesPrev + sharesPrev;

    const engagementTrendPct = pctChange(totalEngagementNow, totalEngagementPrev);

    const newOutletsTrendPct = pctChange(newOutletsNow, newOutletsPrev);

    const topFood = foodAgg[0]
      ? {
        id: String(foodAgg[0]._id),
        name: foodNameById.get(String(foodAgg[0]._id)) || 'Unknown',
        views: foodAgg[0].views || 0,
      }
      : null;

    const topOutlet = outletAgg[0]
      ? {
        id: String(outletAgg[0]._id),
        name: outletNameById.get(String(outletAgg[0]._id)) || 'Unknown',
        views: outletAgg[0].total_views || 0,
      }
      : null;

    const topPromotion = promoAgg[0]
      ? {
        id: String(promoAgg[0]._id),
        title: promoTitleById.get(String(promoAgg[0]._id)) || 'Unknown',
        impressions: promoAgg[0].impressions || 0,
        clicks: promoAgg[0].clicks || 0,
      }
      : null;

    const mostVotedFood = votesAgg[0]
      ? {
        id: String(votesAgg[0]._id),
        name: votedFoodNameById.get(String(votesAgg[0]._id)) || 'Unknown',
        votes: votesAgg[0].votes || 0,
      }
      : null;

    const totalOfferViewsNow = offersAgg.reduce((sum: number, d: any) => sum + (d.views || 0), 0);
    const totalOfferClicksNow = offersAgg.reduce((sum: number, d: any) => sum + (d.clicks || 0), 0);
    const totalOfferCodeCopiesNow = offersAgg.reduce((sum: number, d: any) => sum + (d.code_copies || 0), 0);
    const totalOfferViewsPrev = offersAggPrev.reduce((sum: number, d: any) => sum + (d.views || 0), 0);
    const totalOfferClicksPrev = offersAggPrev.reduce((sum: number, d: any) => sum + (d.clicks || 0), 0);

    const topOffer = offersAgg[0]
      ? {
        id: String(offersAgg[0]._id),
        title: offerTitleById.get(String(offersAgg[0]._id)) || 'Unknown',
        views: offersAgg[0].views || 0,
        clicks: offersAgg[0].clicks || 0,
        codeCopies: offersAgg[0].code_copies || 0,
      }
      : null;

    const averageOutletViewsNow = outletAgg.length > 0 ? totalOutletViewsNow / outletAgg.length : 0;

    const engagementRateNow = totalViewsNow > 0 ? ((totalVotesNow + sharesNow) / totalViewsNow) * 100 : 0;

    return sendSuccess(
      res,
      {
        window: {
          range: window.range,
          start: window.start,
          end: window.end,
        },
        food: {
          topViewed: topFood,
          mostVoted: mostVotedFood,
          totalViews: totalFoodViewsNow,
        },
        outlets: {
          topPerforming: topOutlet,
          totalViews: totalOutletViewsNow,
          averageViewsPerOutlet: averageOutletViewsNow,
        },
        promotions: {
          activeCount: activePromotionsCount,
          topPerforming: topPromotion,
          totalImpressions: totalPromoImpressionsNow,
          totalClicks: totalPromoClicksNow,
        },
        offers: {
          activeCount: activeOffersCount,
          topPerforming: topOffer,
          totalViews: totalOfferViewsNow,
          totalClicks: totalOfferClicksNow,
          totalCodeCopies: totalOfferCodeCopiesNow,
        },
        users: {
          newUsers: usersNewNow,
          activeUsers: activeUsersNow,
          returningUsers: Math.max(0, activeUsersNow - usersNewNow),
        },
        growth: {
          totalOutlets,
          newOutlets: newOutletsNow,
          activeOutlets,
          inactiveOutlets,
          outletGrowthTrendPct: newOutletsTrendPct,
        },
        engagement: {
          totalViews: totalViewsNow,
          totalVotes: totalVotesNow,
          totalShares: sharesNow,
          engagementRatePct: engagementRateNow,
          engagementTrendPct,
        },
        discovery: {
          qrMenuScans: qrMenuScansNow,
          searchAppearances: searchImpressionsNow,
          nearbyDiscoveries: nearbyDiscoveriesNow,
          trendingFoodItem: topFood,
        },
      },
      'Admin analytics overview'
    );
  } catch (error: any) {
    console.error('Admin analytics overview error:', error);
    return sendError(res, error.message || 'Failed to load analytics overview');
  }
};

export const getAdminFoodAnalytics = async (req: Request, res: Response) => {
  try {
    const window = resolveAnalyticsWindow({
      range: req.query.range,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    });

    const [viewsAgg, topVoted, shares] = await Promise.all([
      FoodItemAnalyticsEvent.aggregate([
        {
          $match: {
            event_type: 'item_view',
            timestamp: { $gte: window.start, $lte: window.end },
          },
        },
        {
          $facet: {
            topViewed: [
              { $group: { _id: '$food_item_id', views: { $sum: 1 } } },
              { $sort: { views: -1 } },
              { $limit: 10 },
            ],
            totals: [{ $group: { _id: null, totalViews: { $sum: 1 } } }],
          },
        },
      ]),
      DishVote.aggregate([
        { $match: { created_at: { $gte: window.start, $lte: window.end } } },
        { $group: { _id: '$food_item_id', votes: { $sum: 1 } } },
        { $sort: { votes: -1 } },
        { $limit: 10 },
      ]),
      FoodItemAnalyticsEvent.countDocuments({
        event_type: 'share',
        timestamp: { $gte: window.start, $lte: window.end },
      }),
    ]);

    const topViewed = viewsAgg?.[0]?.topViewed || [];
    const totalViews = viewsAgg?.[0]?.totals?.[0]?.totalViews || 0;

    const topViewedIds = topViewed.map((d: any) => d._id);
    const topVotedIds = topVoted.map((d: any) => d._id);

    const [viewedDocs, votedDocs] = await Promise.all([
      FoodItem.find({ _id: { $in: topViewedIds } }, { name: 1 }).lean(),
      FoodItem.find({ _id: { $in: topVotedIds } }, { name: 1 }).lean(),
    ]);

    const viewedNameById = new Map(viewedDocs.map((f: any) => [String(f._id), f.name]));
    const votedNameById = new Map(votedDocs.map((f: any) => [String(f._id), f.name]));

    return sendSuccess(
      res,
      {
        window: {
          range: window.range,
          start: window.start,
          end: window.end,
        },
        totalViews,
        totalShares: shares,
        topViewed: topViewed.map((d: any) => ({
          id: String(d._id),
          name: viewedNameById.get(String(d._id)) || 'Unknown',
          views: d.views || 0,
        })),
        topVoted: topVoted.map((d: any) => ({
          id: String(d._id),
          name: votedNameById.get(String(d._id)) || 'Unknown',
          votes: d.votes || 0,
        })),
      },
      'Food analytics'
    );
  } catch (error: any) {
    console.error('Admin food analytics error:', error);
    return sendError(res, error.message || 'Failed to load food analytics');
  }
};

export const getAdminOutletAnalytics = async (req: Request, res: Response) => {
  try {
    const window = resolveAnalyticsWindow({
      range: req.query.range,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    });

    const outletsAgg = await OutletAnalyticsEvent.aggregate([
      {
        $match: {
          timestamp: { $gte: window.start, $lte: window.end },
        },
      },
      {
        $group: {
          _id: { outlet_id: '$outlet_id', event_type: '$event_type' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.outlet_id',
          profile_views: {
            $sum: {
              $cond: [{ $eq: ['$_id.event_type', 'profile_view'] }, '$count', 0],
            },
          },
          menu_views: {
            $sum: {
              $cond: [{ $eq: ['$_id.event_type', 'menu_view'] }, '$count', 0],
            },
          },
          outlet_visits: {
            $sum: {
              $cond: [{ $eq: ['$_id.event_type', 'outlet_visit'] }, '$count', 0],
            },
          },
        },
      },
      {
        $addFields: {
          total_views: { $add: ['$profile_views', '$menu_views'] },
        },
      },
      {
        $facet: {
          topOutlets: [{ $sort: { total_views: -1 } }, { $limit: 10 }],
          totals: [
            {
              $group: {
                _id: null,
                totalProfileViews: { $sum: '$profile_views' },
                totalMenuViews: { $sum: '$menu_views' },
                totalOutletVisits: { $sum: '$outlet_visits' },
                uniqueOutletCount: { $sum: 1 },
                totalViews: { $sum: '$total_views' },
              },
            },
          ],
        },
      },
    ]);

    const topOutletsAgg = outletsAgg?.[0]?.topOutlets || [];
    const totalsAgg = outletsAgg?.[0]?.totals || [];

    const outletIds = topOutletsAgg.map((d: any) => d._id);
    const outletDocs = await Outlet.find({ _id: { $in: outletIds } }, { name: 1 }).lean();
    const outletNameById = new Map(outletDocs.map((o: any) => [String(o._id), o.name]));

    const totals = totalsAgg[0] || {
      totalProfileViews: 0,
      totalMenuViews: 0,
      totalOutletVisits: 0,
      uniqueOutletCount: 0,
      totalViews: 0,
    };

    const averageViewsPerOutlet = totals.uniqueOutletCount > 0 ? totals.totalViews / totals.uniqueOutletCount : 0;

    return sendSuccess(
      res,
      {
        window: {
          range: window.range,
          start: window.start,
          end: window.end,
        },
        totals: {
          totalViews: totals.totalViews || 0,
          totalProfileViews: totals.totalProfileViews || 0,
          totalMenuViews: totals.totalMenuViews || 0,
          totalOutletVisits: totals.totalOutletVisits || 0,
          uniqueOutlets: totals.uniqueOutletCount || 0,
          averageViewsPerOutlet,
        },
        topOutlets: topOutletsAgg.map((d: any) => ({
          id: String(d._id),
          name: outletNameById.get(String(d._id)) || 'Unknown',
          views: d.total_views || 0,
        })),
      },
      'Outlet analytics'
    );
  } catch (error: any) {
    console.error('Admin outlet analytics error:', error);
    return sendError(res, error.message || 'Failed to load outlet analytics');
  }
};

export const getAdminPromotionsAnalytics = async (req: Request, res: Response) => {
  try {
    const window = resolveAnalyticsWindow({
      range: req.query.range,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    });

    const [summariesAgg, liveEventsAgg, activeCount] = await Promise.all([
      PromotionAnalyticsSummary.aggregate([
        { $match: { date: { $gte: window.start, $lte: window.end } } },
        {
          $group: {
            _id: '$promotion_id',
            impressions: { $sum: '$metrics.impressions' },
            clicks: { $sum: '$metrics.clicks' },
            menu_views: { $sum: '$metrics.menu_views' },
          },
        },
      ]),
      // Live data for today (if inside window)
      (async () => {
        const todayUtc = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
        if (window.end < todayUtc) return [];

        return PromotionEvent.aggregate([
          {
            $match: {
              timestamp: { $gte: todayUtc, $lte: window.end }
            }
          },
          {
            $group: {
              _id: '$promotion_id',
              impressions: {
                $sum: { $cond: [{ $eq: ['$event_type', 'impression'] }, 1, 0] }
              },
              clicks: {
                $sum: { $cond: [{ $eq: ['$event_type', 'click'] }, 1, 0] }
              },
              menu_views: {
                $sum: { $cond: [{ $eq: ['$event_type', 'menu_view'] }, 1, 0] }
              },
            }
          }
        ]);
      })(),
      FeaturedPromotion.countDocuments({
        is_active: true,
        'scheduling.start_date': { $lte: new Date() },
        'scheduling.end_date': { $gte: new Date() },
      }),
    ]);

    // Merge summaries and live events
    const mergedPromoMap = new Map<string, any>();

    const processAgg = (agg: any[]) => {
      for (const d of agg) {
        const id = String(d._id);
        const existing = mergedPromoMap.get(id) || { impressions: 0, clicks: 0, menu_views: 0 };
        mergedPromoMap.set(id, {
          impressions: existing.impressions + (d.impressions || 0),
          clicks: existing.clicks + (d.clicks || 0),
          menu_views: existing.menu_views + (d.menu_views || 0),
        });
      }
    };

    processAgg(summariesAgg);
    processAgg(liveEventsAgg);

    const topPromosAgg = Array.from(mergedPromoMap.entries()).map(([id, metrics]) => ({
      _id: id,
      ...metrics,
      score: metrics.impressions + (metrics.clicks * 3),
      ctrPct: metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0,
    })).sort((a, b) => b.score - a.score).slice(0, 10);

    const aggregatedTotals = Array.from(mergedPromoMap.values()).reduce((acc, curr) => ({
      totalImpressions: acc.totalImpressions + curr.impressions,
      totalClicks: acc.totalClicks + curr.clicks,
      totalMenuViews: acc.totalMenuViews + curr.menu_views,
    }), { totalImpressions: 0, totalClicks: 0, totalMenuViews: 0 });

    const promoIds = topPromosAgg.map((d: any) => d._id);
    const promoDocs = await FeaturedPromotion.find(
      { _id: { $in: promoIds } },
      { 'display_data.banner_text': 1, 'display_data.link_url': 1 }
    ).lean();
    const promoTitleById = new Map(promoDocs.map((p: any) => [String(p._id), p.display_data?.banner_text || p.display_data?.link_url || 'Promotion']));
    const ctrPct = aggregatedTotals.totalImpressions > 0 ? (aggregatedTotals.totalClicks / aggregatedTotals.totalImpressions) * 100 : 0;

    return sendSuccess(
      res,
      {
        window: {
          range: window.range,
          start: window.start,
          end: window.end,
        },
        totals: {
          activePromotions: activeCount,
          totalImpressions: aggregatedTotals.totalImpressions || 0,
          totalClicks: aggregatedTotals.totalClicks || 0,
          totalMenuViews: aggregatedTotals.totalMenuViews || 0,
          ctrPct,
        },
        topPromotions: topPromosAgg.map((d: any) => ({
          id: String(d._id),
          title: promoTitleById.get(String(d._id)) || 'Unknown',
          impressions: d.impressions || 0,
          clicks: d.clicks || 0,
          menuViews: d.menu_views || 0,
          ctrPct: d.ctrPct || 0,
        })),
      },
      'Promotions analytics'
    );
  } catch (error: any) {
    console.error('Admin promotions analytics error:', error);
    return sendError(res, error.message || 'Failed to load promotions analytics');
  }
};

export const getAdminUsersAnalytics = async (req: Request, res: Response) => {
  try {
    const window = resolveAnalyticsWindow({
      range: req.query.range,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    });

    const [totalUsers, newUsers, activeUsers, engagedFromFood, engagedFromVotes, engagedFromStories] =
      await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ created_at: { $gte: window.start, $lte: window.end } }),
        User.countDocuments({ last_active_at: { $gte: window.start, $lte: window.end } }),
        FoodItemAnalyticsEvent.aggregate([
          {
            $match: {
              user_id: { $exists: true, $ne: null },
              timestamp: { $gte: window.start, $lte: window.end },
            },
          },
          { $group: { _id: '$user_id' } },
          { $limit: 50000 },
        ]),
        DishVote.aggregate([
          { $match: { user_id: { $ne: null }, created_at: { $gte: window.start, $lte: window.end } } },
          { $group: { _id: '$user_id' } },
          { $limit: 50000 },
        ]),
        StoryView.aggregate([
          { $match: { viewedAt: { $gte: window.start, $lte: window.end } } },
          { $group: { _id: '$userId' } },
          { $limit: 50000 },
        ]),
      ]);

    const engagedUserIds = new Set<string>();
    for (const row of engagedFromFood as any[]) engagedUserIds.add(String(row._id));
    for (const row of engagedFromVotes as any[]) engagedUserIds.add(String(row._id));
    for (const row of engagedFromStories as any[]) engagedUserIds.add(String(row._id));

    const engagedUsers = engagedUserIds.size;
    const returningUsers = Math.max(0, activeUsers - newUsers);
    const engagementRatePct = activeUsers > 0 ? (engagedUsers / activeUsers) * 100 : 0;
    const activeRatePct = totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0;

    return sendSuccess(
      res,
      {
        window: { range: window.range, start: window.start, end: window.end },
        totals: {
          totalUsers,
          newUsers,
          activeUsers,
          returningUsers,
          engagedUsers,
          engagementRatePct,
          activeRatePct,
        },
      },
      'Users analytics'
    );
  } catch (error: any) {
    console.error('Admin users analytics error:', error);
    return sendError(res, error.message || 'Failed to load users analytics');
  }
};

export const getAdminGrowthAnalytics = async (req: Request, res: Response) => {
  try {
    const window = resolveAnalyticsWindow({
      range: req.query.range,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    });

    const [totalOutlets, newOutlets, newOutletsPrev, activeOutlets, inactiveOutlets] = await Promise.all([
      Outlet.countDocuments({}),
      Outlet.countDocuments({ created_at: { $gte: window.start, $lte: window.end } }),
      Outlet.countDocuments({ created_at: { $gte: window.prevStart, $lte: window.prevEnd } }),
      Outlet.countDocuments({ status: 'ACTIVE' }),
      Outlet.countDocuments({ status: { $ne: 'ACTIVE' } }),
    ]);

    const outletGrowthTrendPct = pctChange(newOutlets, newOutletsPrev);

    return sendSuccess(
      res,
      {
        window: { range: window.range, start: window.start, end: window.end },
        totals: {
          totalOutlets,
          newOutlets,
          activeOutlets,
          inactiveOutlets,
          outletGrowthTrendPct,
        },
      },
      'Growth analytics'
    );
  } catch (error: any) {
    console.error('Admin growth analytics error:', error);
    return sendError(res, error.message || 'Failed to load growth analytics');
  }
};

export const getAdminEngagementAnalytics = async (req: Request, res: Response) => {
  try {
    const window = resolveAnalyticsWindow({
      range: req.query.range,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    });

    const [
      foodAggNow,
      foodAggPrev,
      outletAggNow,
      outletAggPrev,
      promoAggNow,
      promoAggPrev,
      votesNow,
      votesPrev,
      sharesNow,
      sharesPrev,
    ] = await Promise.all([
      FoodItemAnalyticsSummary.aggregate([
        { $match: { date: { $gte: window.start, $lte: window.end } } },
        { $group: { _id: null, totalViews: { $sum: '$metrics.views' } } },
      ]),
      FoodItemAnalyticsSummary.aggregate([
        { $match: { date: { $gte: window.prevStart, $lte: window.prevEnd } } },
        { $group: { _id: null, totalViews: { $sum: '$metrics.views' } } },
      ]),
      OutletAnalyticsSummary.aggregate([
        { $match: { date: { $gte: window.start, $lte: window.end } } },
        {
          $group: {
            _id: null,
            profileViews: { $sum: '$metrics.profile_views' },
            menuViews: { $sum: '$metrics.menu_views' },
          },
        },
      ]),
      OutletAnalyticsSummary.aggregate([
        { $match: { date: { $gte: window.prevStart, $lte: window.prevEnd } } },
        {
          $group: {
            _id: null,
            profileViews: { $sum: '$metrics.profile_views' },
            menuViews: { $sum: '$metrics.menu_views' },
          },
        },
      ]),
      PromotionAnalyticsSummary.aggregate([
        { $match: { date: { $gte: window.start, $lte: window.end } } },
        { $group: { _id: null, impressions: { $sum: '$metrics.impressions' } } },
      ]),
      PromotionAnalyticsSummary.aggregate([
        { $match: { date: { $gte: window.prevStart, $lte: window.prevEnd } } },
        { $group: { _id: null, impressions: { $sum: '$metrics.impressions' } } },
      ]),
      DishVote.countDocuments({ created_at: { $gte: window.start, $lte: window.end } }),
      DishVote.countDocuments({ created_at: { $gte: window.prevStart, $lte: window.prevEnd } }),
      FoodItemAnalyticsEvent.countDocuments({
        event_type: 'share',
        timestamp: { $gte: window.start, $lte: window.end },
      }),
      FoodItemAnalyticsEvent.countDocuments({
        event_type: 'share',
        timestamp: { $gte: window.prevStart, $lte: window.prevEnd },
      }),
    ]);

    const foodViewsNow = foodAggNow?.[0]?.totalViews || 0;
    const foodViewsPrev = foodAggPrev?.[0]?.totalViews || 0;

    const outletViewsNow = (outletAggNow?.[0]?.profileViews || 0) + (outletAggNow?.[0]?.menuViews || 0);
    const outletViewsPrev = (outletAggPrev?.[0]?.profileViews || 0) + (outletAggPrev?.[0]?.menuViews || 0);

    const promoImpressionsNow = promoAggNow?.[0]?.impressions || 0;
    const promoImpressionsPrev = promoAggPrev?.[0]?.impressions || 0;

    const totalViewsNow = foodViewsNow + outletViewsNow + promoImpressionsNow;
    const totalViewsPrev = foodViewsPrev + outletViewsPrev + promoImpressionsPrev;

    const engagementRatePct = totalViewsNow > 0 ? ((votesNow + sharesNow) / totalViewsNow) * 100 : 0;

    const totalEngagementNow = totalViewsNow + votesNow + sharesNow;
    const totalEngagementPrev = totalViewsPrev + votesPrev + sharesPrev;
    const engagementTrendPct = pctChange(totalEngagementNow, totalEngagementPrev);

    return sendSuccess(
      res,
      {
        window: { range: window.range, start: window.start, end: window.end },
        totals: {
          totalViews: totalViewsNow,
          totalVotes: votesNow,
          totalShares: sharesNow,
          engagementRatePct,
          engagementTrendPct,
        },
      },
      'Engagement analytics'
    );
  } catch (error: any) {
    console.error('Admin engagement analytics error:', error);
    return sendError(res, error.message || 'Failed to load engagement analytics');
  }
};

export const getAdminDiscoveryAnalytics = async (req: Request, res: Response) => {
  try {
    const window = resolveAnalyticsWindow({
      range: req.query.range,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    });

    const [qrNow, qrPrev, searchNow, searchPrev, nearbyNow, nearbyPrev, topFoodAgg] = await Promise.all([
      OutletAnalyticsEvent.countDocuments({
        event_type: 'menu_view',
        source: { $in: ['qr', 'QR', 'qrcode', 'qr_code'] },
        timestamp: { $gte: window.start, $lte: window.end },
      }),
      OutletAnalyticsEvent.countDocuments({
        event_type: 'menu_view',
        source: { $in: ['qr', 'QR', 'qrcode', 'qr_code'] },
        timestamp: { $gte: window.prevStart, $lte: window.prevEnd },
      }),
      FoodItemAnalyticsEvent.countDocuments({
        event_type: 'item_impression',
        source: 'search',
        timestamp: { $gte: window.start, $lte: window.end },
      }),
      FoodItemAnalyticsEvent.countDocuments({
        event_type: 'item_impression',
        source: 'search',
        timestamp: { $gte: window.prevStart, $lte: window.prevEnd },
      }),
      OutletAnalyticsEvent.countDocuments({
        source: { $in: ['nearby', 'map', 'maps'] },
        timestamp: { $gte: window.start, $lte: window.end },
      }),
      OutletAnalyticsEvent.countDocuments({
        source: { $in: ['nearby', 'map', 'maps'] },
        timestamp: { $gte: window.prevStart, $lte: window.prevEnd },
      }),
      FoodItemAnalyticsSummary.aggregate([
        { $match: { date: { $gte: window.start, $lte: window.end } } },
        { $group: { _id: '$food_item_id', views: { $sum: '$metrics.views' } } },
        { $sort: { views: -1 } },
        { $limit: 1 },
      ]),
    ]);

    const totalNow = qrNow + searchNow + nearbyNow;
    const totalPrev = qrPrev + searchPrev + nearbyPrev;
    const discoveryTrendPct = pctChange(totalNow, totalPrev);

    const topFoodId = topFoodAgg?.[0]?._id ? String(topFoodAgg[0]._id) : null;
    const topFoodViews = topFoodAgg?.[0]?.views || 0;

    const topFoodDoc = topFoodId ? await FoodItem.findById(topFoodId, { name: 1 }).lean() : null;

    return sendSuccess(
      res,
      {
        window: { range: window.range, start: window.start, end: window.end },
        totals: {
          qrMenuScans: qrNow,
          searchAppearances: searchNow,
          nearbyDiscoveries: nearbyNow,
          discoveryTrendPct,
        },
        trendingFoodItem: topFoodId
          ? {
            id: topFoodId,
            name: (topFoodDoc as any)?.name || 'Unknown',
            views: topFoodViews,
          }
          : null,
      },
      'Discovery analytics'
    );
  } catch (error: any) {
    console.error('Admin discovery analytics error:', error);
    return sendError(res, error.message || 'Failed to load discovery analytics');
  }
};
export const getAdminOffersAnalytics = async (req: Request, res: Response) => {
  try {
    const window = resolveAnalyticsWindow({
      range: req.query.range,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
    });

    const [offersAgg, activeCount] = await Promise.all([
      OfferEvent.aggregate([
        { $match: { timestamp: { $gte: window.start, $lte: window.end } } },
        {
          $group: {
            _id: '$offer_id',
            views: {
              $sum: { $cond: [{ $in: ['$event_type', ['impression', 'view']] }, 1, 0] },
            },
            clicks: {
              $sum: { $cond: [{ $eq: ['$event_type', 'click'] }, 1, 0] },
            },
            code_copies: {
              $sum: { $cond: [{ $eq: ['$event_type', 'code_copy'] }, 1, 0] },
            },
          },
        },
        {
          $addFields: {
            score: { $add: ['$views', { $multiply: ['$clicks', 2] }, { $multiply: ['$code_copies', 3] }] },
            ctrPct: {
              $cond: [
                { $gt: ['$views', 0] },
                { $multiply: [{ $divide: ['$clicks', '$views'] }, 100] },
                0,
              ],
            },
          },
        },
        { $sort: { score: -1 } },
        { $limit: 20 },
      ]),
      Offer.countDocuments({
        is_active: true,
        valid_from: { $lte: new Date() },
        valid_till: { $gte: new Date() },
      } as any),
    ]);

    const offerIds = offersAgg.map((d: any) => d._id);
    const offerDocs = await Offer.find({ _id: { $in: offerIds } }, { title: 1 }).lean();
    const offerTitleById = new Map(offerDocs.map((o: any) => [String(o._id), o.title]));

    const totalViews = offersAgg.reduce((sum: number, d: any) => sum + (d.views || 0), 0);
    const totalClicks = offersAgg.reduce((sum: number, d: any) => sum + (d.clicks || 0), 0);
    const totalCodeCopies = offersAgg.reduce((sum: number, d: any) => sum + (d.code_copies || 0), 0);
    const ctrPct = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;

    return sendSuccess(
      res,
      {
        window: {
          range: window.range,
          start: window.start,
          end: window.end,
        },
        totals: {
          activeOffers: activeCount,
          totalViews,
          totalClicks,
          totalCodeCopies,
          ctrPct,
        },
        topOffers: offersAgg.map((d: any) => ({
          id: String(d._id),
          title: offerTitleById.get(String(d._id)) || 'Unknown',
          views: d.views || 0,
          clicks: d.clicks || 0,
          codeCopies: d.code_copies || 0,
          ctrPct: d.ctrPct || 0,
        })),
      },
      'Offers analytics'
    );
  } catch (error: any) {
    console.error('Admin offers analytics error:', error);
    return sendError(res, error.message || 'Failed to load offers analytics');
  }
};
