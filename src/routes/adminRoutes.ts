import express from "express";
import { adminAuth } from "../middleware/adminMiddleware.js";
import { Brand } from "../models/Brand.js";
import { Outlet } from "../models/Outlet.js";
import { User } from "../models/User.js";
import { Menu } from "../models/Menu.js";
import { Compliance } from "../models/Compliance.js";
import { sendSuccess, sendError } from "../utils/response.js";

const router = express.Router();

// Check admin auth
router.get("/me", adminAuth, async (req, res) => {
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
router.get("/dashboard/stats", adminAuth, async (req, res) => {
  try {
    const [pendingRequests, pendingBrands, totalBrands, totalOutlets, totalUsers] = await Promise.all([
      Outlet.countDocuments({ approval_status: "PENDING" }),
      Brand.countDocuments({ approval_status: "PENDING" }),
      Brand.countDocuments(),
      Outlet.countDocuments(),
      User.countDocuments(),
    ]);

    return sendSuccess(res, {
      pendingRequests,
      pendingBrands,
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
router.get("/onboarding/requests", adminAuth, async (req, res) => {
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
router.get("/onboarding/requests/:id", adminAuth, async (req, res) => {
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
    const request = {
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
        description: outlet.brand_id?.description,
        cuisine_types: outlet.brand_id?.cuisines,
        verification_status: outlet.brand_id?.verification_status,
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
router.post("/onboarding/:id/approve", adminAuth, async (req, res) => {
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
router.post("/onboarding/:id/reject", adminAuth, async (req, res) => {
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
router.get("/brands", adminAuth, async (req, res) => {
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
router.get("/brands/:id", adminAuth, async (req, res) => {
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
    const brandData = {
      ...brand,
      created_by: brand.created_by || brand.admin_user_id,
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
router.post("/brands/:id/approve", adminAuth, async (req, res) => {
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
router.post("/brands/:id/reject", adminAuth, async (req, res) => {
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
router.post("/brands/:id/cancel", adminAuth, async (req, res) => {
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
router.post("/brands/:id/pending", adminAuth, async (req, res) => {
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

// Toggle brand featured status
router.patch("/brands/:id/toggle-featured", adminAuth, async (req, res) => {
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
router.patch("/compliance/:id/toggle-verification", adminAuth, async (req, res) => {
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
router.get("/outlets", adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const skip = (page - 1) * limit;

    const query = search ? { name: { $regex: search, $options: "i" } } : {};

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

// Get all users
router.get("/users", adminAuth, async (req, res) => {
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

export default router;
