import express from "express";
import mongoose from "mongoose";
import { adminAuth } from "../middleware/adminMiddleware.js";
import { Brand } from "../models/Brand.js";
import { Outlet } from "../models/Outlet.js";
import { Subscription } from "../models/Subscription.js";
import { normalizePlanToTier, hasFeature, SUBSCRIPTION_FEATURES } from "../config/subscriptionPlans.js";
import { User } from "../models/User.js";
import { Menu } from "../models/Menu.js";
import { Compliance } from "../models/Compliance.js";
import { Story } from "../models/Story.js";
import { BrandUpdateRequest } from "../models/BrandUpdateRequest.js";
import { sendSuccess, sendError } from "../utils/response.js";
import * as promotionController from "../controllers/promotionController.js";
import * as outletAnalyticsController from "../controllers/outletAnalyticsController.js";

const router = express.Router();

interface AuthRequest extends express.Request {
  user?: any;
}

// Check admin auth
router.get("/me", adminAuth, async (req: AuthRequest, res) => {
  try {
    return sendSuccess(res, {
      user: req.user,
    });
  } catch (error: any) {
    console.error("Admin me error:", error);
    return sendError(res, error.message);
  }
});

// Dashboard stats
router.get("/dashboard/stats", adminAuth, async (req: AuthRequest, res) => {
  try {
    const [pendingRequests, pendingBrands, brandUpdates, totalBrands, totalOutlets, totalUsers] = await Promise.all([
      // Note: pendingRequests refers to pending outlet onboarding requests
      Outlet.countDocuments({ approval_status: "PENDING" }),
      Brand.countDocuments({ verification_status: "pending" }),
      BrandUpdateRequest.countDocuments({ status: "pending" }),
      Brand.countDocuments(),
      Outlet.countDocuments(),
      User.countDocuments(),
    ]);

    return sendSuccess(res, {
      pendingRequests,
      pendingBrands,
      brandUpdates,
      totalBrands,
      totalOutlets,
      totalUsers,
    });
  } catch (error: any) {
    console.error("Dashboard stats error:", error);
    return sendError(res, error.message);
  }
});

// Onboarding requests
router.get("/onboarding/requests", adminAuth, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const statusFilter = req.query.status as string;

    // Build query - filter by approval_status if provided
    const query: any = {};
    if (statusFilter && statusFilter !== 'all') {
      // Map frontend status to backend approval_status
      if (statusFilter === 'pending_approval') {
        query.approval_status = 'PENDING';
      } else if (statusFilter === 'approved') {
        query.approval_status = 'APPROVED';
      } else if (statusFilter === 'rejected') {
        query.approval_status = 'REJECTED';
      }
    }

    const [outlets, total] = await Promise.all([
      Outlet.find(query)
        .populate("brand_id", "name logo_url")
        .populate("created_by_user_id", "phone email username")
        .select('name slug address contact approval_status approval.submitted_at approval.rejection_reason')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Outlet.countDocuments(query),
    ]);

    // Map outlets to match frontend interface
    const requests = outlets.map((outlet: any) => ({
      _id: outlet._id,
      user_id: {
        _id: outlet.created_by_user_id?._id,
        phone: outlet.created_by_user_id?.phone,
        email: outlet.created_by_user_id?.email,
        name: outlet.created_by_user_id?.username,
      },
      brand_id: {
        _id: outlet.brand_id?._id,
        name: outlet.brand_id?.name,
        logo: outlet.brand_id?.logo_url,
      },
      outlet_id: {
        _id: outlet._id,
        name: outlet.name,
        address: {
          city: outlet.address?.city,
          full: outlet.address?.full,
        },
      },
      status: outlet.approval_status === 'PENDING' ? 'pending_approval' : outlet.approval_status?.toLowerCase(),
      submitted_at: outlet.approval?.submitted_at || outlet.created_at,
      menu_strategy: 'standard', // Default value, adjust if you have this field
      rejection_reason: outlet.approval?.rejection_reason,
    }));

    return sendSuccess(res, {
      requests,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Get onboarding requests error:", error);
    return sendError(res, error.message);
  }
});

// Get onboarding request detail
router.get("/onboarding/requests/:id", adminAuth, async (req: AuthRequest, res) => {
  try {
    const outlet = await Outlet.findById(req.params.id)
      .populate("brand_id", "name logo_url description cuisines verification_status")
      .populate("created_by_user_id", "phone email username")
      .lean();

    if (!outlet) {
      return sendError(res, "Outlet not found", null, 404);
    }

    // Get compliance data for this outlet
    const compliance = await Compliance.findOne({ outlet_id: req.params.id }).lean();

    // Map to frontend interface
    const userDoc = outlet.created_by_user_id as any;
    const brandDoc = outlet.brand_id as any;

    const request = {
      _id: outlet._id,
      user_id: {
        _id: userDoc?._id,
        phone: userDoc?.phone,
        email: userDoc?.email,
        name: userDoc?.username,
      },
      brand_id: {
        _id: brandDoc?._id,
        name: brandDoc?.name,
        logo: brandDoc?.logo_url,
        description: brandDoc?.description,
        cuisine_types: brandDoc?.cuisines,
        verification_status: brandDoc?.verification_status,
      },
      outlet_id: {
        _id: outlet._id,
        name: outlet.name,
        address: outlet.address,
        contact: outlet.contact,
        approval_status: outlet.approval_status,
        status: outlet.status,
      },
      compliance: compliance ? {
        _id: compliance._id,
        fssai_number: compliance.fssai_number,
        gst_number: compliance.gst_number,
        gst_percentage: compliance.gst_percentage,
        is_verified: compliance.is_verified,
        verified_at: compliance.verified_at,
      } : null,
      status: outlet.approval_status === 'PENDING' ? 'pending_approval' : outlet.approval_status?.toLowerCase(),
      submitted_at: outlet.approval?.submitted_at || outlet.created_at,
      menu_strategy: 'standard',
      rejection_reason: outlet.approval?.rejection_reason,
      approved_at: outlet.approval?.reviewed_at && outlet.approval_status === 'APPROVED' ? outlet.approval.reviewed_at : undefined,
      rejected_at: outlet.approval?.reviewed_at && outlet.approval_status === 'REJECTED' ? outlet.approval.reviewed_at : undefined,
    };

    return sendSuccess(res, request);
  } catch (error: any) {
    console.error("Get onboarding request detail error:", error);
    return sendError(res, error.message);
  }
});

// Approve onboarding request
router.post("/onboarding/:id/approve", adminAuth, async (req: AuthRequest, res) => {
  try {
    const outlet = await Outlet.findByIdAndUpdate(
      req.params.id,
      {
        approval_status: "APPROVED",
        status: "ACTIVE",
        'approval.reviewed_at': new Date(),
        'approval.reviewed_by': req.user?.userId
      },
      { new: true }
    );

    if (!outlet) {
      return sendError(res, "Outlet not found", null, 404);
    }

    return sendSuccess(res, outlet, "Outlet approved successfully");
  } catch (error: any) {
    console.error("Approve outlet error:", error);
    return sendError(res, error.message);
  }
});

// Reject onboarding request
router.post("/onboarding/:id/reject", adminAuth, async (req: AuthRequest, res) => {
  try {
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return sendError(res, "Rejection reason is required", null, 400);
    }

    const outlet = await Outlet.findByIdAndUpdate(
      req.params.id,
      {
        approval_status: "REJECTED",
        status: "REJECTED",
        'approval.rejection_reason': reason,
        'approval.reviewed_at': new Date(),
        'approval.reviewed_by': req.user?.userId
      },
      { new: true }
    );

    if (!outlet) {
      return sendError(res, "Outlet not found", null, 404);
    }

    return sendSuccess(res, outlet, "Outlet rejected successfully");
  } catch (error: any) {
    console.error("Reject outlet error:", error);
    return sendError(res, error.message);
  }
});

// Get all brands
router.get("/brands", adminAuth, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const verificationStatus = req.query.verification_status as string;
    const operatingMode = req.query.operating_mode as string;
    const isFeatured = req.query.is_featured as string;
    const skip = (page - 1) * limit;

    const query: any = {};

    // Search filter
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    // Verification status filter
    if (verificationStatus && verificationStatus !== 'all') {
      query.verification_status = verificationStatus;
    }

    // Operating mode filter
    if (operatingMode && operatingMode !== 'all') {
      if (operatingMode === 'corporate') {
        query['operating_modes.corporate'] = true;
        query['operating_modes.franchise'] = false;
      } else if (operatingMode === 'franchise') {
        query['operating_modes.corporate'] = false;
        query['operating_modes.franchise'] = true;
      } else if (operatingMode === 'hybrid') {
        query['operating_modes.corporate'] = true;
        query['operating_modes.franchise'] = true;
      } else if (operatingMode === 'open') {
        query['operating_modes.corporate'] = false;
        query['operating_modes.franchise'] = false;
      }
    }

    // Featured filter
    if (isFeatured && isFeatured !== 'all') {
      query.is_featured = isFeatured === 'true';
    }

    const [brands, total] = await Promise.all([
      Brand.find(query)
        .populate("admin_user_id", "phone email username")
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Brand.countDocuments(query),
    ]);

    return sendSuccess(res, {
      brands,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Get brands error:", error);
    return sendError(res, error.message);
  }
});

// Get brand by ID
router.get("/brands/:id", adminAuth, async (req: AuthRequest, res) => {
  try {
    const brand = await Brand.findById(req.params.id)
      .populate("admin_user_id", "phone email username")
      .populate("verified_by", "email")
      .lean();

    if (!brand) {
      return sendError(res, "Brand not found", null, 404);
    }

    // Get outlets for this brand with minimal details
    const outlets = await Outlet.find({ brand_id: req.params.id })
      .select('name slug status approval_status address contact media')
      .lean();

    // Get menus for this brand
    const menus = await Menu.find({ brand_id: req.params.id })
      .select('name slug is_active is_default categories')
      .lean();

    // Count total items across all menus
    const totalItems = menus.reduce((sum, menu) => {
      return sum + menu.categories.reduce((catSum: number, cat: any) => {
        return catSum + (cat.items?.length || 0);
      }, 0);
    }, 0);

    // Ensure created_by is populated (fallback to admin_user_id)
    const brandObj = brand as any;
    const brandData = {
      ...brandObj,
      created_by: brandObj.created_by || brandObj.admin_user_id,
    };

    return sendSuccess(res, {
      brand: brandData,
      outlets,
      outletsCount: outlets.length,
      menus: menus.map(menu => ({
        _id: menu._id,
        name: menu.name,
        slug: menu.slug,
        is_active: menu.is_active,
        is_default: menu.is_default,
        categoriesCount: menu.categories?.length || 0,
        itemsCount: menu.categories?.reduce((sum: number, cat: any) => sum + (cat.items?.length || 0), 0) || 0
      })),
      menusCount: menus.length,
      totalMenuItems: totalItems
    });
  } catch (error: any) {
    console.error("Get brand details error:", error);
    return sendError(res, error.message);
  }
});

// Approve brand
router.post("/brands/:id/approve", adminAuth, async (req: AuthRequest, res) => {
  try {
    const brand = await Brand.findByIdAndUpdate(
      req.params.id,
      {
        verification_status: "approved",
        verified_at: new Date(),
      },
      { new: true }
    );

    if (!brand) {
      return sendError(res, "Brand not found", null, 404);
    }

    return sendSuccess(res, brand, "Brand approved successfully");
  } catch (error: any) {
    console.error("Approve brand error:", error);
    return sendError(res, error.message);
  }
});

// Reject brand
router.post("/brands/:id/reject", adminAuth, async (req: AuthRequest, res) => {
  try {
    const brand = await Brand.findByIdAndUpdate(
      req.params.id,
      {
        verification_status: "rejected",
        verified_at: new Date(),
      },
      { new: true }
    );

    if (!brand) {
      return sendError(res, "Brand not found", null, 404);
    }

    return sendSuccess(res, brand, "Brand rejected successfully");
  } catch (error: any) {
    console.error("Reject brand error:", error);
    return sendError(res, error.message);
  }
});

// Cancel/Reset brand verification
router.post("/brands/:id/cancel", adminAuth, async (req: AuthRequest, res) => {
  try {
    const brand = await Brand.findByIdAndUpdate(
      req.params.id,
      {
        verification_status: "cancelled",
        verified_at: new Date(),
      },
      { new: true }
    );

    if (!brand) {
      return sendError(res, "Brand not found", null, 404);
    }

    return sendSuccess(res, brand, "Brand cancelled successfully");
  } catch (error: any) {
    console.error("Cancel brand error:", error);
    return sendError(res, error.message);
  }
});

// Set brand back to pending
router.post("/brands/:id/pending", adminAuth, async (req: AuthRequest, res) => {
  try {
    const brand = await Brand.findByIdAndUpdate(
      req.params.id,
      {
        verification_status: "pending",
        verified_at: null,
        verified_by: null,
      },
      { new: true }
    );

    if (!brand) {
      return sendError(res, "Brand not found", null, 404);
    }

    return sendSuccess(res, brand, "Brand status reset to pending");
  } catch (error: any) {
    console.error("Reset brand error:", error);
    return sendError(res, error.message);
  }
});

// --- Brand Update Request Routes ---

// List all brand update requests
router.get("/brand-updates", adminAuth, async (req: AuthRequest, res) => {
  try {
    const { status, search } = req.query;
    const query: any = {};

    // Debug: Check if any documents exist at all
    const totalDocs = await BrandUpdateRequest.countDocuments({});
    console.log(`[CreateDebug] Total BrandUpdateRequests in DB: ${totalDocs}`);

    // If status is provided, filter by it (unless it's 'all' or empty)
    if (status && status !== 'all') {
      query.status = status;
    } else if (status === undefined) {
      // Default to pending ONLY if status query param is completely missing
      query.status = 'pending';
    }
    // If status is '' (empty string from frontend 'all'), no filter is applied

    // Search by brand name if search is provided
    if (search) {
      const brands = await Brand.find({
        name: { $regex: typeof search === 'string' ? search : '', $options: 'i' }
      }).select('_id');
      const brandIds = brands.map(b => b._id);
      query.brand_id = { $in: brandIds };
    }

    const requests = await BrandUpdateRequest.find(query)
      .populate("brand_id", "name logo_url")
      .populate("requester_id", "phone email username")
      .sort({ created_at: -1 });

    return sendSuccess(res, {
      requests,
      total: requests.length
    });
  } catch (error: any) {
    console.error("Get brand updates error:", error);
    return sendError(res, error.message);
  }
});

// Get brand update request detail (with diff)
router.get("/brand-updates/:id", adminAuth, async (req: AuthRequest, res) => {
  try {
    const request = await BrandUpdateRequest.findById(req.params.id)
      .populate("brand_id")
      .populate("requester_id", "phone email username")
      .lean();

    if (!request) {
      return sendError(res, "Update request not found", null, 404);
    }

    return sendSuccess(res, request);
  } catch (error: any) {
    console.error("Get brand update detail error:", error);
    return sendError(res, error.message);
  }
});

// Approve brand update request
router.post("/brand-updates/:id/approve", adminAuth, async (req: AuthRequest, res) => {
  try {
    const request = await BrandUpdateRequest.findById(req.params.id);
    if (!request) {
      return sendError(res, "Update request not found", null, 404);
    }

    if (request.status !== 'pending') {
      return sendError(res, "Request is already processed", null, 400);
    }

    // Apply changes to the brand
    const brand = await Brand.findById(request.brand_id);
    if (!brand) {
      return sendError(res, "Brand not found", null, 404);
    }

    // Map new_data to brand
    const newData = request.new_data;
    if (newData.name) {
      brand.name = newData.name;
      // Update slug if name changed
      brand.slug = newData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    if (newData.description !== undefined) brand.description = newData.description;
    if (newData.logo_url) brand.logo_url = newData.logo_url;
    if (newData.cuisines) brand.cuisines = newData.cuisines;
    if (newData.operating_modes) brand.operating_modes = newData.operating_modes;
    if (newData.social_media) brand.social_media = newData.social_media;

    await brand.save();

    // Update request status
    request.status = 'approved';
    request.reviewed_by = req.user?.userId;
    request.reviewed_at = new Date();
    await request.save();

    return sendSuccess(res, brand, "Brand updates approved and applied successfully");
  } catch (error: any) {
    console.error("Approve brand update error:", error);
    return sendError(res, error.message);
  }
});

// Reject brand update request
router.post("/brand-updates/:id/reject", adminAuth, async (req: AuthRequest, res) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return sendError(res, "Rejection reason is required", null, 400);
    }

    const request = await BrandUpdateRequest.findById(req.params.id);
    if (!request) {
      return sendError(res, "Update request not found", null, 404);
    }

    request.status = 'rejected';
    request.rejection_reason = reason;
    request.reviewed_by = req.user?.userId;
    request.reviewed_at = new Date();
    await request.save();

    return sendSuccess(res, request, "Brand update rejected");
  } catch (error: any) {
    console.error("Reject brand update error:", error);
    return sendError(res, error.message);
  }
});

// Toggle brand featured status
router.patch("/brands/:id/toggle-featured", adminAuth, async (req: AuthRequest, res) => {
  try {
    const brand = await Brand.findById(req.params.id);

    if (!brand) {
      return sendError(res, "Brand not found", null, 404);
    }

    const updatedBrand = await Brand.findByIdAndUpdate(
      req.params.id,
      { is_featured: !brand.is_featured },
      { new: true, runValidators: false }
    );

    return sendSuccess(
      res,
      { is_featured: updatedBrand?.is_featured },
      `Brand is now ${updatedBrand?.is_featured ? "featured" : "not featured"}`
    );
  } catch (error: any) {
    console.error("Toggle featured error:", error);
    return sendError(res, error.message);
  }
});

// Toggle compliance verification status
router.patch("/compliance/:id/toggle-verification", adminAuth, async (req: AuthRequest, res) => {
  try {
    const compliance = await Compliance.findById(req.params.id);

    if (!compliance) {
      return sendError(res, "Compliance not found", null, 404);
    }

    const updatedCompliance = await Compliance.findByIdAndUpdate(
      req.params.id,
      {
        is_verified: !compliance.is_verified,
        verified_at: !compliance.is_verified ? new Date() : undefined,
        verified_by: !compliance.is_verified ? req.user?.userId : undefined
      },
      { new: true }
    );

    return sendSuccess(
      res,
      updatedCompliance,
      `Compliance is now ${updatedCompliance?.is_verified ? "verified" : "not verified"}`
    );
  } catch (error: any) {
    console.error("Toggle compliance verification error:", error);
    return sendError(res, error.message);
  }
});

// Get all outlets
router.get("/outlets", adminAuth, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const status = req.query.status as string;
    const approvalStatus = req.query.approval_status as string;
    const operatingMode = req.query.operating_mode as string;
    const skip = (page - 1) * limit;

    const query: any = {};

    // Search filter
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    // Status filter
    if (status && status !== "all") {
      query.status = status;
    }

    // Approval status filter
    if (approvalStatus && approvalStatus !== "all") {
      query.approval_status = approvalStatus;
    }

    // Operating mode filter
    if (operatingMode && operatingMode !== "all") {
      query.operating_mode = operatingMode;
    }

    const [outlets, total] = await Promise.all([
      Outlet.find(query)
        .populate("brand_id", "name")
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Outlet.countDocuments(query),
    ]);

    return sendSuccess(res, {
      outlets,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Get outlets error:", error);
    return sendError(res, error.message);
  }
});

// Get outlet by ID with full details
router.get("/outlets/:id", adminAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const outlet = await Outlet.findById(id)
      .populate("brand_id", "name logo description cuisine_types verification_status")
      .populate("created_by_user_id", "name email phone")
      .lean();

    if (!outlet) {
      return sendError(res, "Outlet not found", 404);
    }

    // Get compliance information
    const compliance = await Compliance.findOne({ outlet_id: id }).lean();

    // Get menus for this outlet
    const menus = await Menu.find({ outlet_id: id })
      .select("name description is_active")
      .lean();

    // Add items count to each menu
    const menusWithCount = await Promise.all(
      menus.map(async (menu: any) => {
        const itemsCount = await Menu.aggregate([
          { $match: { _id: menu._id } },
          { $unwind: "$categories" },
          { $unwind: "$categories.items" },
          { $count: "total" }
        ]);
        return {
          ...menu,
          items_count: itemsCount[0]?.total || 0
        };
      })
    );

    // TODO: Get activities (if you have an Activity model)
    // const activities = await Activity.find({ outlet_id: id })
    //   .populate("performed_by", "name email")
    //   .sort({ created_at: -1 })
    //   .limit(10)
    //   .lean();

    const outletData = {
      ...outlet,
      compliance,
      menus: menusWithCount,
      activities: [], // Add actual activities when Activity model is available
    };

    return sendSuccess(res, outletData);
  } catch (error: any) {
    console.error("Get outlet detail error:", error);
    return sendError(res, error.message);
  }
});

// Approve outlet
router.post("/outlets/:id/approve", adminAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const outlet = await Outlet.findByIdAndUpdate(
      id,
      {
        approval_status: "APPROVED",
        status: "ACTIVE",
        "approval.reviewed_by": req.user?._id,
        "approval.reviewed_at": new Date(),
      },
      { new: true }
    );

    if (!outlet) {
      return sendError(res, "Outlet not found", 404);
    }

    return sendSuccess(res, outlet, "Outlet approved successfully");
  } catch (error: any) {
    console.error("Approve outlet error:", error);
    return sendError(res, error.message);
  }
});

// Reject outlet
router.post("/outlets/:id/reject", adminAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return sendError(res, "Rejection reason is required", 400);
    }

    const outlet = await Outlet.findByIdAndUpdate(
      id,
      {
        approval_status: "REJECTED",
        status: "REJECTED",
        "approval.reviewed_by": req.user?._id,
        "approval.reviewed_at": new Date(),
        "approval.rejection_reason": reason,
      },
      { new: true }
    );

    if (!outlet) {
      return sendError(res, "Outlet not found", 404);
    }

    return sendSuccess(res, outlet, "Outlet rejected successfully");
  } catch (error: any) {
    console.error("Reject outlet error:", error);
    return sendError(res, error.message);
  }
});

// Change outlet status
router.patch("/outlets/:id/status", adminAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return sendError(res, "Status is required", 400);
    }

    const validStatuses = ["DRAFT", "ACTIVE", "INACTIVE", "REJECTED", "ARCHIVED"];
    if (!validStatuses.includes(status)) {
      return sendError(res, "Invalid status", 400);
    }

    const outlet = await Outlet.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!outlet) {
      return sendError(res, "Outlet not found", 404);
    }

    return sendSuccess(res, outlet, "Outlet status updated successfully");
  } catch (error: any) {
    console.error("Update outlet status error:", error);
    return sendError(res, error.message);
  }
});

// Change outlet owner
router.patch("/outlets/:id/change-owner", adminAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return sendError(res, "User ID is required", 400);
    }

    // Verify user exists
    const user = await User.findById(user_id);
    if (!user) {
      return sendError(res, "User not found", 404);
    }

    const outlet = await Outlet.findByIdAndUpdate(
      id,
      { created_by_user_id: user_id },
      { new: true }
    ).populate("created_by_user_id", "name email phone");

    if (!outlet) {
      return sendError(res, "Outlet not found", 404);
    }

    return sendSuccess(res, outlet, "Outlet owner updated successfully");
  } catch (error: any) {
    console.error("Change outlet owner error:", error);
    return sendError(res, error.message);
  }
});

// Get all users
router.get("/users", adminAuth, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const skip = (page - 1) * limit;

    const query = search
      ? {
        $or: [
          { phone: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { username: { $regex: search, $options: "i" } },
        ],
      }
      : {};

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    return sendSuccess(res, {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Get users error:", error);
    return sendError(res, error.message);
  }
});

// Get single user details (owned brands/outlets + managed outlets)
router.get("/users/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, "Invalid user id", null, 400);
    }

    const user = await User.findById(id).select("-password_hash").lean();
    if (!user) {
      return sendError(res, "User not found", null, 404);
    }

    const [ownedBrands, ownedOutlets, managedOutletsByManagerField] = await Promise.all([
      Brand.find({ admin_user_id: id })
        .select("name slug verification_status is_active is_featured created_at")
        .sort({ created_at: -1 })
        .lean(),
      Outlet.find({ created_by_user_id: id })
        .populate("brand_id", "name")
        .select("name slug status approval_status created_at brand_id")
        .sort({ created_at: -1 })
        .lean(),
      Outlet.find({ "managers.user_id": id })
        .populate("brand_id", "name")
        .select("name slug status approval_status created_at brand_id managers")
        .sort({ created_at: -1 })
        .lean(),
    ]);

    // Also derive managed outlets via user.roles (scope: outlet, role: manager/staff)
    const roleOutletIds = (user as any)?.roles
      ?.filter((r: any) => r?.scope === "outlet" && (r?.role === "manager" || r?.role === "staff") && r?.outletId)
      ?.map((r: any) => String(r.outletId))
      ?.filter(Boolean);

    const roleOutletIdSet = new Set<string>(roleOutletIds || []);
    const managersOutletIdSet = new Set<string>(
      managedOutletsByManagerField.map((o: any) => String(o._id))
    );

    const missingRoleOutletIds = [...roleOutletIdSet].filter((oid) => !managersOutletIdSet.has(oid));

    const managedOutletsByRole = missingRoleOutletIds.length
      ? await Outlet.find({ _id: { $in: missingRoleOutletIds } })
          .populate("brand_id", "name")
          .select("name slug status approval_status created_at brand_id")
          .sort({ created_at: -1 })
          .lean()
      : [];

    // Dedupe managed outlets
    const managedMap = new Map<string, any>();
    for (const o of managedOutletsByManagerField) managedMap.set(String(o._id), o);
    for (const o of managedOutletsByRole as any[]) managedMap.set(String(o._id), o);
    const managedOutlets = [...managedMap.values()];

    const allOutletIds = Array.from(
      new Set<string>([...ownedOutlets, ...managedOutlets].map((o: any) => String(o._id)))
    );

    const subscriptions = allOutletIds.length
      ? await Subscription.find({ outlet_id: { $in: allOutletIds } })
          .select('outlet_id plan status end_date trial_ends_at payment_status')
          .lean()
      : [];

    const subByOutletId = new Map<string, any>();
    for (const s of subscriptions as any[]) {
      subByOutletId.set(String(s.outlet_id), s);
    }

    const toOutletWithSubscription = (outlet: any) => {
      const sub = subByOutletId.get(String(outlet._id));
      const tier = normalizePlanToTier(sub?.plan);
      const status = sub?.status || 'inactive';
      const isActive = status === 'active' || status === 'trial';
      const entitlements = {
        analytics:
          tier === 'premium' &&
          isActive &&
          hasFeature(sub?.plan || 'free', SUBSCRIPTION_FEATURES.ADVANCED_ANALYTICS),
        offers:
          tier === 'premium' &&
          isActive &&
          hasFeature(sub?.plan || 'free', SUBSCRIPTION_FEATURES.OFFER_MANAGEMENT)
      };

      return {
        ...outlet,
        subscription_summary: {
          tier,
          status,
          end_date: sub?.end_date ?? null,
          trial_ends_at: sub?.trial_ends_at ?? null,
          payment_status: sub?.payment_status ?? 'pending',
          entitlements
        }
      };
    };

    const ownedOutletsWithSubscription = ownedOutlets.map(toOutletWithSubscription);
    const managedOutletsWithSubscription = managedOutlets.map(toOutletWithSubscription);

    return sendSuccess(res, {
      user,
      ownedBrands,
      ownedOutlets: ownedOutletsWithSubscription,
      managedOutlets: managedOutletsWithSubscription,
    });
  } catch (error: any) {
    console.error("Get user detail error:", error);
    return sendError(res, error.message);
  }
});

// --- Content Moderation Routes ---

// Get pending stories for moderation
router.get("/moderation/stories", adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const query = {
      'flags.isModerated': false,
      status: { $in: ['live', 'active'] } // Only moderate live content
    };

    const [stories, total] = await Promise.all([
      Story.find(query)
        .populate({
          path: 'outletId',
          select: 'name brand_id',
          populate: { path: 'brand_id', select: 'name logo_url' }
        })
        .populate('createdBy', 'username email')
        .sort({ created_at: 1 }) // Oldest first
        .skip(skip)
        .limit(limit)
        .lean(),
      Story.countDocuments(query)
    ]);

    return sendSuccess(res, {
      stories,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error: any) {
    console.error("Get moderation stories error:", error);
    return sendError(res, error.message);
  }
});

// Approve story (mark as moderated)
router.post("/moderation/stories/:id/approve", adminAuth, async (req, res) => {
  try {
    const story = await Story.findByIdAndUpdate(
      req.params.id,
      {
        'flags.isModerated': true,
        'flags.isRejected': false
      },
      { new: true }
    );
    if (!story) return sendError(res, "Story not found", null, 404);
    return sendSuccess(res, story, "Story approved");
  } catch (error: any) {
    return sendError(res, error.message);
  }
});

// Reject story
router.post("/moderation/stories/:id/reject", adminAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const story = await Story.findByIdAndUpdate(
      req.params.id,
      {
        'flags.isModerated': true,
        'flags.isRejected': true,
        'flags.rejectionReason': reason,
        status: 'archived'
      },
      { new: true }
    );
    if (!story) return sendError(res, "Story not found", null, 404);
    return sendSuccess(res, story, "Story rejected");
  } catch (error: any) {
    return sendError(res, error.message);
  }
});

// ============================================
// Promotion Management Routes
// ============================================

// Create promotion
router.post("/promotions", adminAuth, promotionController.createPromotion);

// Get all promotions (with filters)
router.get("/promotions", adminAuth, promotionController.getPromotions);

// Get single promotion
router.get("/promotions/:id", adminAuth, promotionController.getPromotion);

// Update promotion
router.patch("/promotions/:id", adminAuth, promotionController.updatePromotion);

// Toggle promotion status
router.patch("/promotions/:id/status", adminAuth, promotionController.togglePromotionStatus);

// Delete promotion
router.delete("/promotions/:id", adminAuth, promotionController.deletePromotion);

// Get promotion analytics
router.get("/promotions/:id/analytics", adminAuth, promotionController.getPromotionAnalytics);

// Outlet analytics
router.get("/outlets/:id/analytics", adminAuth, outletAnalyticsController.getOutletAnalytics);

export default router;
