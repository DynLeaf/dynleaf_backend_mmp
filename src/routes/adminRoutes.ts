import express from "express";
import { adminAuth } from "../middleware/adminMiddleware.js";

// Modular Admin Routers
import adminDashboardRoutes from "./admin/adminDashboardRoutes.js";
import adminOnboardingRoutes from "./admin/adminOnboardingRoutes.js";
import adminBrandRoutes from "./admin/adminBrandRoutes.js";
import adminOutletRoutes from "./admin/adminOutletRoutes.js";
import adminComplianceRoutes from "./admin/adminComplianceRoutes.js";
import adminUserRoutes from "./admin/adminUserRoutes.js";
import adminStaffRoutes from "./admin/adminStaffRoutes.js";
import adminModerationRoutes from "./admin/adminModerationRoutes.js";
import adminCategoryRoutes from "./admin/adminCategoryRoutes.js";
import adminQRRoutes from "./admin/adminQRRoutes.js";

// Specific Domain Controllers mapped via router layer
import * as promotionController from "../controllers/promotionController.js";
import * as outletAnalyticsController from "../controllers/outletAnalyticsController.js";
import * as adminAnalyticsController from "../controllers/adminAnalyticsController.js";
import * as pushNotificationController from "../controllers/pushNotificationController.js";
import * as adminNotificationController from "../controllers/adminNotificationController.js";

const router = express.Router();

router.get("/public-test", (req, res) => res.send("Admin routes reachable!"));

// --- New Modular Mounts ---
router.use("/", adminDashboardRoutes); // /me, /dashboard/stats
router.use("/onboarding", adminOnboardingRoutes);
router.use("/brands", adminBrandRoutes);
router.use("/brand-updates", adminBrandRoutes); // Brand updates handled in brands router for now
router.use("/outlets", adminOutletRoutes);
router.use("/users", adminUserRoutes);
router.use("/compliance", adminComplianceRoutes);
router.use("/staff", adminStaffRoutes);
router.use("/moderation", adminModerationRoutes);
router.use("/category-images", adminCategoryRoutes); 
router.use("/category-slug-map", adminCategoryRoutes); 
router.use("/categories-without-images", adminCategoryRoutes);
router.use("/qr", adminQRRoutes);

// --- Promotions Management ---
router.post("/promotions", adminAuth, promotionController.createPromotion);
router.get("/promotions", adminAuth, promotionController.getPromotions);
router.get("/promotions/:id", adminAuth, promotionController.getPromotion);
router.patch("/promotions/:id", adminAuth, promotionController.updatePromotion);
router.patch("/promotions/:id/status", adminAuth, promotionController.togglePromotionStatus);
router.delete("/promotions/:id", adminAuth, promotionController.deletePromotion);
router.get("/promotions/:id/analytics", adminAuth, promotionController.getPromotionAnalytics);
router.post("/promotions/upload-signature", adminAuth, promotionController.getS3SignatureForPromotion);
router.post("/promotions/upload-via-backend", adminAuth, promotionController.uploadPromotionImageViaBackend);

// --- Analytics ---
router.get("/outlets/:id/analytics", adminAuth, outletAnalyticsController.getOutletAnalytics);

// Complete Admin Analytics from the Analytics Refactor
router.get('/analytics/overview', adminAuth, adminAnalyticsController.getAdminAnalyticsOverview);
router.get('/analytics/food', adminAuth, adminAnalyticsController.getAdminFoodAnalyticsHandler);
router.get('/analytics/outlets', adminAuth, adminAnalyticsController.getAdminOutletAnalyticsHandler);
router.get('/analytics/promotions', adminAuth, adminAnalyticsController.getAdminPromotionsAnalyticsHandler);
router.get('/analytics/offers', adminAuth, adminAnalyticsController.getAdminOffersAnalyticsHandler);
router.get('/analytics/responses', adminAuth, adminAnalyticsController.getAdminSystemAnalytics);


// --- Push Notifications ---
router.post('/notifications', adminAuth, pushNotificationController.createPushNotification);
router.get('/notifications', adminAuth, pushNotificationController.getPushNotifications);
router.get('/notifications/:id', adminAuth, pushNotificationController.getPushNotificationDetail);
router.patch('/notifications/:id', adminAuth, pushNotificationController.updatePushNotification);
router.post('/notifications/:id/send', adminAuth, pushNotificationController.sendPushNotification);
router.delete('/notifications/:id', adminAuth, pushNotificationController.deletePushNotification);
router.get('/notifications/:id/analytics', adminAuth, pushNotificationController.getPushNotificationAnalytics);
router.post('/notifications/upload-signature', adminAuth, pushNotificationController.getCloudinarySignatureForNotification);
router.post('/notifications/upload-via-backend', adminAuth, pushNotificationController.uploadNotificationImageViaBackend);
router.post('/notifications/:notificationId/event', pushNotificationController.recordNotificationEvent);
router.get('/notifications-stats', adminAuth, pushNotificationController.getPushNotificationStats);

// --- Admin Notifications ---
router.get('/admin-notifications', adminAuth, adminNotificationController.getNotifications);
router.patch('/admin-notifications/read-all', adminAuth, adminNotificationController.markAllRead);
router.patch('/admin-notifications/:id/read', adminAuth, adminNotificationController.markOneRead);
router.delete('/admin-notifications', adminAuth, adminNotificationController.deleteAll);
router.delete('/admin-notifications/:id', adminAuth, adminNotificationController.deleteOne);

export default router;
