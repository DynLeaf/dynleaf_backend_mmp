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
import jwt from "jsonwebtoken";

interface AuthRequest extends Request {
  user?: any;
}

export const sendOtp = async (req: Request, res: Response) => {
  try {
    console.log("reached");
    console.log("reached");
    const { phone } = req.body;

    if (!phone) {
      return sendError(res, "Phone number is required", null, 400);
    }

    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phone)) {
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
    console.log(deviceInfo, "vdg");

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

    if (user.locked_until && user.locked_until > new Date()) {
      return sendError(res, "Account temporarily locked", { locked_until: user.locked_until }, 403);
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

    user.last_login_at = new Date();
    user.last_login_ip = req.ip || req.socket.remoteAddress;
    user.last_login_device = deviceInfo.deviceName;
    user.failed_login_attempts = 0;
    await user.save();

    const brands = await Brand.find({ admin_user_id: user._id });
    const outlets = await outletService.getUserOutletsList(user._id.toString());

    const hasCompletedOnboarding =
      user.roles.some((r) => r.role === "restaurant_owner") &&
      brands.length > 0 &&
      user.currentStep === "DONE";

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    res.cookie("accessToken", newAccessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000, // 15 mins
    });
    res.cookie("refreshToken", newRefreshToken, cookieOptions);
    res.cookie("isLoggedIn", "true", { ...cookieOptions, httpOnly: false });

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
        brands: brands.map((b) => ({ id: b._id, name: b.name, slug: b.slug })),
        outlets: outlets.map((o: any) => ({
          id: o._id,
          name: o.name,
          brandId: o.brand_id?._id || o.brand_id,
        })),
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

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    res.cookie("accessToken", newAccessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000, // 15 mins
    });
    res.cookie("refreshToken", newRefreshToken, cookieOptions);
    res.cookie("isLoggedIn", "true", { ...cookieOptions, httpOnly: false });

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

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    res.clearCookie("isLoggedIn");
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
    const outlets = await Outlet.find({ created_by_user_id: user._id });

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
        brands: brands.map((b) => ({
          id: b._id,
          name: b.name,
          slug: b.slug,
          logo_url: b.logo_url,
        })),
        outlets: outlets.map((o) => ({
          id: o._id,
          name: o.name,
          brandId: o.brand_id,
          status: o.status,
        })),
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

    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 15 * 60 * 1000, // 15 mins
    });

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

    // Hardcoded admin credentials
    const ADMIN_EMAIL = "admin@gmail.com";
    const ADMIN_PASSWORD = "pass@123";

    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return sendError(res, "Invalid credentials", null, 401);
    }

    // Create admin user object
    const adminUser = {
      id: "admin",
      email: ADMIN_EMAIL,
      name: "Admin",
      role: "admin",
    };

    // Generate simple JWT token for admin
    const token = jwt.sign(
      { userId: "admin", email: ADMIN_EMAIL, role: "admin" },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "7d" }
    );

    // Set HTTP-only cookie
    res.cookie("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

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
