import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { sendError } from "../utils/response.js";

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

    // Check if it's an admin token
    if (decoded.userId !== "admin") {
      return sendError(res, "Admin access required", null, 403);
    }

    req.user = {
      id: "admin",
      email: "admin@gmail.com",
      role: "admin",
    };

    next();
  } catch (error: any) {
    console.error("Admin auth error:", error);
    return sendError(res, "Invalid token", null, 401);
  }
};
