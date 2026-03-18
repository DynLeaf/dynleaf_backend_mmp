import { Request, Response } from "express";
import mongoose from "mongoose";
import { Brand } from "../models/Brand.js";
import { Outlet } from "../models/Outlet.js";
import { User } from "../models/User.js";
import { Compliance } from "../models/Compliance.js";
import { Story } from "../models/Story.js";
import { StoryView } from "../models/StoryView.js";
import { StoryMetrics } from "../models/StoryMetrics.js";
import { BrandUpdateRequest } from "../models/BrandUpdateRequest.js";
import { BrandMember } from "../models/BrandMember.js";
import { Menu } from "../models/Menu.js";
import { Category } from "../models/Category.js";
import { FoodItem } from "../models/FoodItem.js";
import { Offer } from "../models/Offer.js";
import { OfferEvent } from "../models/OfferEvent.js";
import { Follow } from "../models/Follow.js";
import { FeaturedPromotion } from "../models/FeaturedPromotion.js";
import { OperatingHours } from "../models/OperatingHours.js";
import { OutletMenuItem } from "../models/OutletMenuItem.js";
import { OutletSubMenu } from "../models/OutletSubMenu.js";
import OutletQRConfig from "../models/OutletQRConfig.js";
import { OutletAnalyticsEvent } from "../models/OutletAnalyticsEvent.js";
import { OutletAnalyticsSummary } from "../models/OutletAnalyticsSummary.js";
import { OutletInsightsSummary } from "../models/OutletInsightsSummary.js";
import { FoodItemAnalyticsEvent } from "../models/FoodItemAnalyticsEvent.js";
import { FoodItemAnalyticsSummary } from "../models/FoodItemAnalyticsSummary.js";
import { PromotionAnalyticsSummary } from "../models/PromotionAnalyticsSummary.js";
import { PromotionEvent } from "../models/PromotionEvent.js";
import { OnboardingSession } from "../models/OnboardingSession.js";
import { Combo } from "../models/Combo.js";
import { Franchise } from "../models/Franchise.js";
import { Subscription } from "../models/Subscription.js";
import { sendSuccess, sendError } from "../utils/response.js";

interface AuthRequest extends Request {
  user?: any;
}

// Shorthand: cast a query filter to any to avoid Mongoose TypeScript overload
// mismatches where the model Generic doesn't include all fields we query on.
const q = (filter: Record<string, any>) => filter as any;

/**
 * Cascade-deletes a single outlet and ALL of its related data from the database.
 * This is a shared helper used by both hardDeleteOutlet and hardDeleteBrand.
 */
async function cascadeDeleteOutlet(outletId: mongoose.Types.ObjectId): Promise<void> {
  // 1. Delete stories and their view / metrics records first
  const stories = await Story.find(q({ outletId })).select("_id").lean();
  if (stories.length > 0) {
    const storyIds = stories.map((s) => s._id);
    await Promise.all([
      StoryView.deleteMany(q({ storyId: { $in: storyIds } })),
      StoryMetrics.deleteMany(q({ storyId: { $in: storyIds } })),
    ]);
    await Story.deleteMany(q({ outletId }));
  }

  // 2. Delete all outlet-scoped collections in parallel
  await Promise.all([
    Compliance.deleteMany(q({ outlet_id: outletId })),
    Menu.deleteMany(q({ outlet_id: outletId })),
    OutletMenuItem.deleteMany(q({ outlet_id: outletId })),
    OutletSubMenu.deleteMany(q({ outlet_id: outletId })),
    OutletQRConfig.deleteMany(q({ outlet_id: outletId })),
    OutletAnalyticsEvent.deleteMany(q({ outlet_id: outletId })),
    OutletAnalyticsSummary.deleteMany(q({ outlet_id: outletId })),
    OutletInsightsSummary.deleteMany(q({ outlet_id: outletId })),
    FoodItemAnalyticsEvent.deleteMany(q({ outlet_id: outletId })),
    FoodItemAnalyticsSummary.deleteMany(q({ outlet_id: outletId })),
    PromotionAnalyticsSummary.deleteMany(q({ outlet_id: outletId })),
    PromotionEvent.deleteMany(q({ outlet_id: outletId })),
    Offer.deleteMany(q({ outlet_id: outletId })),
    OfferEvent.deleteMany(q({ outlet_id: outletId })),
    FeaturedPromotion.deleteMany(q({ outlet_id: outletId })),
    OperatingHours.deleteMany(q({ outlet_id: outletId })),
    OnboardingSession.deleteMany(q({ outlet_id: outletId })),
    FoodItem.deleteMany(q({ outlet_id: outletId })),
    Category.deleteMany(q({ outlet_id: outletId })),
    Combo.deleteMany(q({ outlet_id: outletId })),
    Follow.deleteMany(q({ outlet: outletId })),
    // Remove outlet from all users' outlets array and outlet-scoped roles
    User.updateMany(
      { $or: [{ outlets: outletId }, { "roles.outletId": outletId }] },
      { $pull: { outlets: outletId, roles: { outletId } } as any }
    ),
  ]);

  // 3. Delete the outlet document itself
  await Outlet.findByIdAndDelete(outletId);
}

/**
 * DELETE /admin/outlets/:id
 * Permanently hard-deletes an outlet and all of its related data.
 */
export const hardDeleteOutlet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      sendError(res, "Invalid outlet ID", null, 400);
      return;
    }

    const outlet = await Outlet.findById(id).select("_id").lean();
    if (!outlet) {
      sendError(res, "Outlet not found", null, 404);
      return;
    }

    await cascadeDeleteOutlet(new mongoose.Types.ObjectId(id));

    sendSuccess(res, { deleted: true, id }, "Outlet permanently deleted");
  } catch (error: any) {
    console.error("Hard delete outlet error:", error);
    sendError(res, error.message, null, 500);
  }
};

/**
 * DELETE /admin/brands/:id
 * Permanently hard-deletes a brand, all of its outlets (full cascade), and all brand-level data.
 */
export const hardDeleteBrand = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      sendError(res, "Invalid brand ID", null, 400);
      return;
    }

    const brand = await Brand.findById(id).select("_id").lean();
    if (!brand) {
      sendError(res, "Brand not found", null, 404);
      return;
    }

    const brandOid = new mongoose.Types.ObjectId(id);

    // 1. Cascade-delete every outlet under this brand sequentially
    const outlets = await Outlet.find(q({ brand_id: brandOid })).select("_id").lean();
    for (const outlet of outlets) {
      await cascadeDeleteOutlet(new mongoose.Types.ObjectId(outlet._id.toString()));
    }

    // 2. Delete brand-level data in parallel
    await Promise.all([
      BrandMember.deleteMany(q({ brand_id: brandOid })),
      BrandUpdateRequest.deleteMany(q({ brand_id: brandOid })),
      Franchise.deleteMany(q({ brand_id: brandOid })),
      Menu.deleteMany(q({ brand_id: brandOid })),
      Subscription.deleteMany(q({ brand_id: brandOid })),
      // Remove brand from all users' brands array and brand-scoped roles
      User.updateMany(
        { $or: [{ brands: brandOid }, { "roles.brandId": brandOid }] },
        { $pull: { brands: brandOid, roles: { brandId: brandOid } } as any }
      ),
    ]);

    // 3. Delete the brand document itself
    await Brand.findByIdAndDelete(brandOid);

    sendSuccess(res, { deleted: true, id }, "Brand and all related data permanently deleted");
  } catch (error: any) {
    console.error("Hard delete brand error:", error);
    sendError(res, error.message, null, 500);
  }
};
