import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { sendError } from "../utils/response.js";
import { Admin } from "../models/Admin.js";

interface AuthRequest extends Request {
  user?: any;
}

export const adminAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies.admin_token;

    if (!token) {
      return sendError(res, "Authentication required", null, 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret") as any;

    // Verify admin exists and is active
    const admin = await Admin.findById(decoded.userId);

    if (!admin) {
      return sendError(res, "Admin not found", null, 401);
    }

    if (!admin.is_active) {
      return sendError(res, "Admin account is deactivated", null, 403);
    }

    // Check if account is locked
    if (admin.locked_until && admin.locked_until > new Date()) {
      return sendError(res, "Account temporarily locked", null, 403);
    }

    req.user = {
      id: admin._id.toString(),
      userId: admin._id.toString(),
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions,
    };

    next();
  } catch (error: any) {
    console.error("Admin auth error:", error);
    return sendError(res, "Invalid token", null, 401);
  }
};
