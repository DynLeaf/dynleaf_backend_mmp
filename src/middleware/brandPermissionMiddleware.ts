import { Request, Response, NextFunction } from 'express';
import { BrandMember } from '../models/BrandMember.js';
import { Outlet } from '../models/Outlet.js';
import { Brand } from '../models/Brand.js';
import { sendError } from '../utils/response.js';

/**
 * Middleware to check if user has permission to sync menus across brand outlets
 */
export const checkBrandSyncPermission = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = (req as any).user?.id || (req as any).user?._id;
        if (!userId) {
            return sendError(res, 'Unauthorized', 401);
        }

        const { outletId } = req.params;
        const { targetOutletIds } = req.body;

        if (!targetOutletIds || !Array.isArray(targetOutletIds) || targetOutletIds.length === 0) {
            return sendError(res, 'Target outlet IDs are required', 400);
        }

        // Get source outlet
        const sourceOutlet = await Outlet.findById(outletId);
        if (!sourceOutlet) {
            return sendError(res, 'Source outlet not found', 404);
        }

        // Get all target outlets
        const targetOutlets = await Outlet.find({
            _id: { $in: targetOutletIds }
        });

        if (targetOutlets.length === 0) {
            return sendError(res, 'No valid target outlets found', 404);
        }

        // Check if all outlets belong to same brand
        const brandId = sourceOutlet.brand_id;
        const differentBrand = targetOutlets.some(o => o.brand_id.toString() !== brandId.toString());

        if (differentBrand) {
            return sendError(res, 'Cannot sync across different brands', 403);
        }

        // Check user's brand membership
        const membership = await BrandMember.findOne({
            brand_id: brandId,
            user_id: userId
        });

        // 1. Check if user owns these outlets directly (always allowed, legacy behavior)
        const allOutlets = [sourceOutlet, ...targetOutlets];
        const userOwnsAll = allOutlets.every(outlet =>
            outlet.created_by_user_id?.toString() === userId.toString() ||
            outlet.managers?.some(m => m.user_id?.toString() === userId.toString())
        );

        if (userOwnsAll) {
            return next();
        }

        // 2. Not own all outlets? Check brand-wide permission
        if (!membership) {
            return sendError(res, 'You do not own all target outlets and are not a member of this brand', 403);
        }

        if (!membership.permissions?.can_sync_menu) {
            return sendError(res, 'You do not have brand-wide sync permissions', 403);
        }

        // Get brand settings
        const brand = await Brand.findById(brandId);

        // If brand sync is not enabled as a brand setting, but user is Owner/Manager
        // allow them but optionally auto-enable it if they are the owner
        if (!brand?.settings?.allow_cross_user_sync) {
            if (membership.role === 'brand_owner') {
                // Auto-enable for owner
                await Brand.findByIdAndUpdate(brandId, {
                    $set: { 'settings.allow_cross_user_sync': true }
                });
            } else {
                return sendError(res, 'Brand-wide sync is not enabled for this brand. Please ask the brand owner to enable it.', 403);
            }
        }

        // Role-based check
        if (membership.role === 'brand_owner' || membership.role === 'brand_manager') {
            return next();
        }

        if (membership.role === 'outlet_manager') {
            // Outlet managers can only sync FROM their own outlets TO any brand outlet
            const managesSource =
                sourceOutlet.created_by_user_id?.toString() === userId.toString() ||
                sourceOutlet.managers?.some(m => m.user_id?.toString() === userId.toString());

            if (!managesSource) {
                return sendError(res, 'You can only sync from outlets you manage', 403);
            }
            return next();
        }

        return sendError(res, 'Insufficient permissions', 403);
    } catch (error: any) {
        console.error('Brand sync permission check error:', error);
        return sendError(res, 'Sync permission check failed: ' + error.message, 500);
    }
};

/**
 * Helper function to check if user can sync in a brand
 */
export const canUserSyncInBrand = async (userId: string, brandId: string): Promise<boolean> => {
    const membership = await BrandMember.findOne({
        brand_id: brandId,
        user_id: userId
    });

    return membership?.permissions.can_sync_menu || false;
};

/**
 * Helper function to get user's brand role
 */
export const getUserBrandRole = async (userId: string, brandId: string): Promise<string | null> => {
    const membership = await BrandMember.findOne({
        brand_id: brandId,
        user_id: userId
    });

    return membership?.role || null;
};

/**
 * Helper function to get brand outlets accessible to user
 */
export const getBrandOutletsForUser = async (userId: string, brandId: string) => {
    const membership = await BrandMember.findOne({
        brand_id: brandId,
        user_id: userId
    });

    if (!membership) {
        return [];
    }

    // Brand owners and managers can access all outlets
    if (membership.role === 'brand_owner' || membership.role === 'brand_manager') {
        return await Outlet.find({
            brand_id: brandId,
            approval_status: 'APPROVED'
        });
    }

    // Outlet managers can only access their assigned outlets
    if (membership.role === 'outlet_manager') {
        return await Outlet.find({
            brand_id: brandId,
            approval_status: 'APPROVED',
            $or: [
                { created_by_user_id: userId },
                { 'managers.user_id': userId }
            ]
        });
    }

    return [];
};
