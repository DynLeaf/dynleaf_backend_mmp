import { Request, Response } from "express";
import { User } from "../models/User.js";
import { Brand } from "../models/Brand.js";
import { Outlet } from "../models/Outlet.js";
import { Session } from "../models/Session.js";
import { Follow } from "../models/Follow.js";
import * as otpService from "../services/otpService.js";
import * as tokenService from "../services/tokenService.js";
import * as sessionService from "../services/sessionService.js";
import * as outletService from "../services/outletService.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { Admin } from "../models/Admin.js";
import jwt from "jsonwebtoken";

interface AuthRequest extends Request {
  user?: any;
}

// Cookie configuration constants
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const ACCESS_TOKEN_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 15 * 60 * 1000, // 15 mins
};

const PUBLIC_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  httpOnly: false,
};

const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;
const ACCOUNT_LOCK_DURATION = 30 * 60 * 1000; // 30 minutes
const MAX_FAILED_ATTEMPTS = 5;

// Helper functions
const validatePhoneNumber = (phone: string): boolean => {
  return PHONE_REGEX.test(phone);
};

const setAuthCookies = (res: Response, accessToken: string, refreshToken: string) => {
  res.cookie("accessToken", accessToken, ACCESS_TOKEN_OPTIONS);
  res.cookie("refreshToken", refreshToken, COOKIE_OPTIONS);
  res.cookie("isLoggedIn", "true", PUBLIC_COOKIE_OPTIONS);
};

const clearAuthCookies = (res: Response) => {
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
  res.clearCookie("isLoggedIn");
};

const mapBrandToResponse = (brand: any) => ({
  id: brand._id,
  name: brand.name,
  slug: brand.slug,
  logo_url: brand.logo_url,
});

const mapOutletToResponse = (outlet: any) => ({
  id: outlet._id,
  name: outlet.name,
  brandId: outlet.brand_id?._id || outlet.brand_id,
  status: outlet.status,
});

const checkAccountLock = (lockUntil?: Date) => {
  if (lockUntil && lockUntil > new Date()) {
    return {
      isLocked: true,
      locked_until: lockUntil,
    };
  }
  return { isLocked: false };
};

const ensureRestaurantOwnerRole = async (user: any, outlets: any[]) => {
  if (outlets.length > 0 && !user.roles.some((r: any) => r.role === "restaurant_owner")) {
    user.roles.push({
      scope: "platform",
      role: "restaurant_owner",
      assignedAt: new Date(),
    });
  }
};

const updateLoginMetadata = (user: any, req: Request, deviceInfo?: any) => {
  user.last_login_at = new Date();
  user.last_login_ip = req.ip || req.socket.remoteAddress;
  if (deviceInfo?.deviceName) {
    user.last_login_device = deviceInfo.deviceName;
  } else if (req.headers['user-agent']) {
    user.last_login_device = req.headers['user-agent'];
  }
  user.failed_login_attempts = 0;
  user.locked_until = undefined;
};

export const sendOtp = async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return sendError(res, "Phone number is required", null, 400);
    }

    if (!validatePhoneNumber(phone)) {
      return sendError(res, "Invalid phone number format", null, 400);
    }

    const rateLimit = await otpService.checkRateLimit(phone);
    if (!rateLimit.allowed) {
      return sendError(res, "Too many OTP requests", { retryAfter: rateLimit.retryAfter }, 429);
    }

    const result = await otpService.sendOTP(phone);

    return sendSuccess(res, { expiresIn: result.expiresIn }, "OTP sent successfully");
  } catch (error: any) {
    console.error("Send OTP error:", error);
    return sendError(res, error.message);
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { phone, otp, deviceInfo } = req.body;

    if (!phone || !otp) {
      return sendError(res, "Phone and OTP are required", null, 400);
    }

    if (!deviceInfo || !deviceInfo.deviceId) {
      return sendError(res, "Device information is required", null, 400);
    }

    const isValid = await otpService.verifyOTP(phone, otp);

    if (!isValid) {
      return sendError(res, "Invalid OTP", null, 401);
    }

    let user = await User.findOne({ phone });

    if (!user) {
      user = await User.create({
        phone,
        roles: [
          {
            scope: "platform",
            role: "customer",
            assignedAt: new Date(),
          },
        ],
        is_verified: true,
        is_active: true,
        currentStep: "BRAND",
      });
    }

    if (user.is_suspended) {
      return sendError(res, "Account suspended", { reason: user.suspension_reason }, 403);
    }

    const lockCheck = checkAccountLock(user.locked_until);
    if (lockCheck.isLocked) {
      return sendError(res, "Account temporarily locked", { locked_until: lockCheck.locked_until }, 403);
    }

    const accessToken = tokenService.generateAccessToken(user, "", undefined);
    const refreshToken = tokenService.generateRefreshToken(
      user._id.toString(),
      "",
      1
    );

    const session = await sessionService.createSession(
      user._id.toString(),
      refreshToken,
      {
        device_id: deviceInfo.deviceId,
        device_name: deviceInfo.deviceName,
        device_type: deviceInfo.deviceType,
        os: deviceInfo.os,
        browser: deviceInfo.browser,
        ip_address: req.ip || req.socket.remoteAddress || "unknown",
      }
    );

    const newAccessToken = tokenService.generateAccessToken(
      user,
      session._id.toString(),
      undefined
    );
    const newRefreshToken = tokenService.generateRefreshToken(
      user._id.toString(),
      session._id.toString(),
      1
    );

    await sessionService.rotateRefreshToken(
      session._id.toString(),
      newRefreshToken
    );

    updateLoginMetadata(user, req, deviceInfo);
    await user.save();

    const brands = await Brand.find({ admin_user_id: user._id });
    const outlets = await outletService.getUserOutletsList(user._id.toString());

    await ensureRestaurantOwnerRole(user, outlets);

    const hasCompletedOnboarding =
      user.roles.some((r) => r.role === "restaurant_owner") &&
      brands.length > 0 &&
      user.currentStep === "DONE";

    setAuthCookies(res, newAccessToken, newRefreshToken);

    return sendSuccess(res, {
      user: {
        id: user._id,
        phone: user.phone,
        email: user.email,
        username: user.username,
        avatar_url: user.avatar_url,
        roles: user.roles,
        currentStep: user.currentStep,
        hasCompletedOnboarding,
        brands: brands.map(mapBrandToResponse),
        outlets: outlets.map(mapOutletToResponse),
        is_verified: user.is_verified,
        is_active: user.is_active,
      },
    });
  } catch (error: any) {
    console.error("Verify OTP error:", error);
    return sendError(res, error.message);
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return sendError(res, "Refresh token is required", null, 401);
    }

    const decoded = tokenService.verifyRefreshToken(refreshToken);

    const isValidSession = await sessionService.validateSession(
      decoded.sessionId
    );
    if (!isValidSession) {
      return sendError(res, "Invalid or expired session", null, 401);
    }

    const isValidToken = await sessionService.verifyRefreshToken(
      decoded.sessionId,
      refreshToken
    );
    if (!isValidToken) {
      return sendError(res, "Invalid refresh token", null, 401);
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.is_active || user.is_suspended) {
      return sendError(res, "User not found or inactive", null, 401);
    }

    const newAccessToken = tokenService.generateAccessToken(
      user,
      decoded.sessionId,
      undefined
    );
    const newRefreshToken = tokenService.generateRefreshToken(
      user._id.toString(),
      decoded.sessionId,
      decoded.tokenVersion + 1
    );

    await sessionService.rotateRefreshToken(decoded.sessionId, newRefreshToken);

    setAuthCookies(res, newAccessToken, newRefreshToken);

    return sendSuccess(res, null);
  } catch (error: any) {
    console.error("Refresh token error:", error);
    return sendError(res, "Invalid or expired refresh token", null, 401);
  }
};

export const logout = async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId, allDevices } = req.body;
    const userId = req.user.id;

    if (allDevices) {
      await sessionService.revokeAllSessions(userId);
    } else if (deviceId) {
      await sessionService.revokeSessionByDevice(userId, deviceId);
    } else {
      await sessionService.revokeSession(req.user.sessionId);
    }

    clearAuthCookies(res);
    return sendSuccess(res, null, "Logged out successfully");
  } catch (error: any) {
    console.error("Logout error:", error);
    return sendError(res, error.message);
  }
};

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return sendError(res, "User not found", null, 404);
    }

    const brands = await Brand.find({ admin_user_id: user._id });
    const outlets = await outletService.getUserOutletsList(user._id.toString());

    await ensureRestaurantOwnerRole(user, outlets);

    const hasCompletedOnboarding =
      user.roles.some((r) => r.role === "restaurant_owner") &&
      brands.length > 0 &&
      user.currentStep === "DONE";

    // Determine onboarding status
    let onboardingStatus: 'pending_details' | 'pending_approval' | 'approved' | 'rejected' = 'pending_details';
    if (hasCompletedOnboarding) {
      // Check if there's an onboarding request
      const OnboardingRequest = (await import('../models/OnboardingRequest.js')).OnboardingRequest;
      const onboardingRequest = await OnboardingRequest.findOne({ user_id: user._id }).sort({ created_at: -1 });
      if (onboardingRequest) {
        onboardingStatus = onboardingRequest.status;
      } else if (user.currentStep === 'DONE') {
        onboardingStatus = 'pending_approval';
      }
    }

    // Get following count
    const followingCount = await Follow.countDocuments({ user: user._id });

    return sendSuccess(res, {
      user: {
        id: user._id,
        phone: user.phone,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        bio: user.bio,
        roles: user.roles,
        activeRole: req.user.activeRole,
        currentStep: user.currentStep,
        hasCompletedOnboarding,
        onboardingStatus,
        brands: brands.map(mapBrandToResponse),
        outlets: outlets.map(mapOutletToResponse),
        permissions: req.user.permissions,
        is_verified: user.is_verified,
        is_active: user.is_active,
        last_login_at: user.last_login_at,
        following_count: followingCount,
      },
    });
  } catch (error: any) {
    console.error("Get current user error:", error);
    return sendError(res, error.message);
  }
};

export const switchRole = async (req: AuthRequest, res: Response) => {
  try {
    const { scope, role, brandId, outletId } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, "User not found", null, 404);
    }

    const hasRole = user.roles.some((r) => {
      if (r.scope !== scope || r.role !== role) return false;
      if (brandId && r.brandId?.toString() !== brandId) return false;
      if (outletId && r.outletId?.toString() !== outletId) return false;
      return true;
    });

    if (!hasRole) {
      return sendError(res, "You do not have this role", null, 403);
    }

    const activeRole = {
      scope,
      role,
      brandId,
      outletId,
    };

    const newAccessToken = tokenService.generateAccessToken(
      user,
      req.user.sessionId,
      activeRole
    );

    user.preferred_role = role;
    await user.save();

    res.cookie("accessToken", newAccessToken, ACCESS_TOKEN_OPTIONS);

    return sendSuccess(res, {
      user: {
        id: user._id,
        activeRole,
      },
    });
  } catch (error: any) {
    console.error("Switch role error:", error);
    return sendError(res, error.message);
  }
};

export const getSessions = async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await sessionService.getUserSessions(req.user.id);

    const sessionsWithCurrent = sessions.map((session) => ({
      ...session,
      isCurrent: session.id.toString() === req.user.sessionId,
    }));

    return sendSuccess(res, { sessions: sessionsWithCurrent });
  } catch (error: any) {
    console.error("Get sessions error:", error);
    return sendError(res, error.message);
  }
};

export const deleteSession = async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await Session.findById(sessionId);
    if (!session) {
      return sendError(res, "Session not found", null, 404);
    }

    if (session.user_id.toString() !== req.user.id) {
      return sendError(res, "Unauthorized", null, 403);
    }

    await sessionService.revokeSession(sessionId);

    return sendSuccess(res, null, "Session deleted successfully");
  } catch (error: any) {
    console.error("Delete session error:", error);
    return sendError(res, error.message);
  }
};

export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, "Email and password are required", null, 400);
    }

    console.log('[AdminLogin] Attempting login for:', email);

    // Find admin by email
    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });

    console.log('[AdminLogin] Admin found:', !!admin);

    if (!admin) {
      return sendError(res, "Invalid credentials", null, 401);
    }

    const lockCheck = checkAccountLock(admin.locked_until);
    if (lockCheck.isLocked) {
      const minutesLeft = Math.ceil((lockCheck.locked_until!.getTime() - Date.now()) / 60000);
      return sendError(
        res,
        `Account temporarily locked. Try again in ${minutesLeft} minutes`,
        { locked_until: lockCheck.locked_until },
        403
      );
    }

    // Check if account is active
    if (!admin.is_active) {
      return sendError(res, "Account is deactivated", null, 403);
    }

    // Verify password
    const isPasswordValid = await admin.comparePassword(password);

    if (!isPasswordValid) {
      admin.failed_login_attempts += 1;

      if (admin.failed_login_attempts >= MAX_FAILED_ATTEMPTS) {
        admin.locked_until = new Date(Date.now() + ACCOUNT_LOCK_DURATION);
        await admin.save();
        return sendError(
          res,
          "Too many failed login attempts. Account locked for 30 minutes",
          null,
          403
        );
      }

      await admin.save();
      return sendError(res, "Invalid credentials", null, 401);
    }

    updateLoginMetadata(admin, req);
    await admin.save();

    // Create admin user object
    const adminUser = {
      id: admin._id.toString(),
      email: admin.email,
      name: admin.full_name,
      role: admin.role,
      permissions: admin.permissions,
    };

    // Generate JWT token for admin
    const token = jwt.sign(
      {
        userId: admin._id.toString(),
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "7d" }
    );

    res.cookie("admin_token", token, COOKIE_OPTIONS);

    return sendSuccess(res, { user: adminUser }, "Login successful");
  } catch (error: any) {
    console.error("Admin login error:", error);
    return sendError(res, error.message);
  }
};

export const adminLogout = async (req: Request, res: Response) => {
  try {
    res.clearCookie("admin_token");
    return sendSuccess(res, null, "Logout successful");
  } catch (error: any) {
    console.error("Admin logout error:", error);
    return sendError(res, error.message);
  }
};
