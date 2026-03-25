import { Request, Response } from "express";
import * as adminDeleteService from "../services/adminDeleteService.js";
import { sendSuccess, sendError } from "../utils/response.js";

interface AuthRequest extends Request {
  user?: any;
}

/**
 * DELETE /admin/outlets/:id
 * Permanently hard-deletes an outlet and all of its related data.
 */
export const hardDeleteOutlet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id || id.length !== 24) {
      sendError(res, "Invalid outlet ID", null, 400);
      return;
    }

    const { success, message, status } = await adminDeleteService.deleteOutlet(id);
    
    if (!success) {
      sendError(res, message, null, status);
      return;
    }

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

    if (!id || id.length !== 24) {
      sendError(res, "Invalid brand ID", null, 400);
      return;
    }

    const { success, message, status } = await adminDeleteService.deleteBrand(id);
    
    if (!success) {
      sendError(res, message, null, status);
      return;
    }

    sendSuccess(res, { deleted: true, id }, "Brand and all related data permanently deleted");
  } catch (error: any) {
    console.error("Hard delete brand error:", error);
    sendError(res, error.message, null, 500);
  }
};


