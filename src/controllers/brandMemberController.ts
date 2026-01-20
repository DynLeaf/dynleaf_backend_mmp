import { Request, Response } from 'express';
import { BrandMember } from '../models/BrandMember.js';
import { Brand } from '../models/Brand.js';
import { Outlet } from '../models/Outlet.js';
import { sendSuccess, sendError } from '../utils/response.js';

/**
 * Get all members of a brand
 */
export const getBrandMembers = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const userId = (req as any).user?.id;

        // Verify brand exists
        const brand = await Brand.findById(brandId);
        if (!brand) {
            return sendError(res, 'Brand not found', 404);
        }

        // Check if user has permission to view members
        const userMembership = await BrandMember.findOne({
            brand_id: brandId,
            user_id: userId
        });

        if (!userMembership) {
            return sendError(res, 'Access denied', 403);
        }

        // Get all brand members
        const members = await BrandMember.find({ brand_id: brandId })
            .populate('user_id', 'name email phone')
            .sort({ created_at: -1 });

        return sendSuccess(res, members.map(m => ({
            id: m._id,
            userId: m.user_id,
            role: m.role,
            permissions: m.permissions,
            assignedOutlets: m.assigned_outlets,
            createdAt: m.created_at
        })));
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

/**
 * Add a new member to a brand
 */
export const addBrandMember = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { userId: newUserId, role, permissions, assignedOutlets } = req.body;
        const currentUserId = (req as any).user?.id;

        // Verify brand exists
        const brand = await Brand.findById(brandId);
        if (!brand) {
            return sendError(res, 'Brand not found', 404);
        }

        // Check if current user is brand owner
        const currentUserMembership = await BrandMember.findOne({
            brand_id: brandId,
            user_id: currentUserId
        });

        if (!currentUserMembership || currentUserMembership.role !== 'brand_owner') {
            return sendError(res, 'Only brand owners can add members', 403);
        }

        // Check if user is already a member
        const existingMember = await BrandMember.findOne({
            brand_id: brandId,
            user_id: newUserId
        });

        if (existingMember) {
            return sendError(res, 'User is already a member of this brand', 400);
        }

        // Create new member
        const newMember = await BrandMember.create({
            brand_id: brandId,
            user_id: newUserId,
            role: role || 'outlet_manager',
            permissions: permissions || {
                can_sync_menu: true,
                can_manage_outlets: false,
                can_manage_members: false
            },
            assigned_outlets: assignedOutlets || []
        });

        return sendSuccess(res, {
            id: newMember._id,
            userId: newMember.user_id,
            role: newMember.role,
            permissions: newMember.permissions,
            assignedOutlets: newMember.assigned_outlets
        }, 'Member added successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

/**
 * Update a brand member's role or permissions
 */
export const updateBrandMemberRole = async (req: Request, res: Response) => {
    try {
        const { brandId, userId: targetUserId } = req.params;
        const { role, permissions, assignedOutlets } = req.body;
        const currentUserId = (req as any).user?.id;

        // Verify brand exists
        const brand = await Brand.findById(brandId);
        if (!brand) {
            return sendError(res, 'Brand not found', 404);
        }

        // Check if current user is brand owner
        const currentUserMembership = await BrandMember.findOne({
            brand_id: brandId,
            user_id: currentUserId
        });

        if (!currentUserMembership || currentUserMembership.role !== 'brand_owner') {
            return sendError(res, 'Only brand owners can update member roles', 403);
        }

        // Prevent owner from demoting themselves
        if (currentUserId === targetUserId && role !== 'brand_owner') {
            return sendError(res, 'Cannot change your own role', 400);
        }

        // Update member
        const updates: any = {};
        if (role) updates.role = role;
        if (permissions) updates.permissions = permissions;
        if (assignedOutlets) updates.assigned_outlets = assignedOutlets;

        const updatedMember = await BrandMember.findOneAndUpdate(
            { brand_id: brandId, user_id: targetUserId },
            updates,
            { new: true }
        );

        if (!updatedMember) {
            return sendError(res, 'Member not found', 404);
        }

        return sendSuccess(res, {
            id: updatedMember._id,
            userId: updatedMember.user_id,
            role: updatedMember.role,
            permissions: updatedMember.permissions,
            assignedOutlets: updatedMember.assigned_outlets
        }, 'Member updated successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

/**
 * Remove a member from a brand
 */
export const removeBrandMember = async (req: Request, res: Response) => {
    try {
        const { brandId, userId: targetUserId } = req.params;
        const currentUserId = (req as any).user?.id;

        // Verify brand exists
        const brand = await Brand.findById(brandId);
        if (!brand) {
            return sendError(res, 'Brand not found', 404);
        }

        // Check if current user is brand owner
        const currentUserMembership = await BrandMember.findOne({
            brand_id: brandId,
            user_id: currentUserId
        });

        if (!currentUserMembership || currentUserMembership.role !== 'brand_owner') {
            return sendError(res, 'Only brand owners can remove members', 403);
        }

        // Prevent owner from removing themselves
        if (currentUserId === targetUserId) {
            return sendError(res, 'Cannot remove yourself from the brand', 400);
        }

        // Remove member
        const result = await BrandMember.findOneAndDelete({
            brand_id: brandId,
            user_id: targetUserId
        });

        if (!result) {
            return sendError(res, 'Member not found', 404);
        }

        return sendSuccess(res, null, 'Member removed successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

/**
 * Get brand outlets accessible to user
 */
export const getBrandOutlets = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const userId = (req as any).user?.id;

        // Verify brand exists
        const brand = await Brand.findById(brandId);
        if (!brand) {
            return sendError(res, 'Brand not found', 404);
        }

        // Check if user has access to this brand
        let membership = await BrandMember.findOne({
            brand_id: brandId,
            user_id: userId
        });

        // Auto-create membership if user owns outlets in this brand
        if (!membership) {
            const userOutlets = await Outlet.find({
                brand_id: brandId,
                $or: [
                    { created_by_user_id: userId },
                    { 'managers.user_id': userId }
                ]
            });

            if (userOutlets.length > 0) {
                const isBrandOwner = brand.owner_user_id?.toString() === userId ||
                    brand.admin_user_id?.toString() === userId;

                membership = await BrandMember.create({
                    brand_id: brandId,
                    user_id: userId,
                    role: isBrandOwner ? 'brand_owner' : 'outlet_manager',
                    permissions: {
                        can_sync_menu: true,
                        can_manage_outlets: isBrandOwner,
                        can_manage_members: isBrandOwner
                    }
                });

                // Auto-enable brand sync if user is brand owner and it's not set
                if (isBrandOwner && !brand.settings?.allow_cross_user_sync) {
                    await Brand.findByIdAndUpdate(brandId, {
                        $set: { 'settings.allow_cross_user_sync': true }
                    });
                }
            }
        }

        if (!membership) {
            return sendError(res, 'Access denied', 403);
        }

        let outlets;

        // If user has permission to sync, they should be able to see ALL approved outlets 
        // in the brand as potential sync targets. The actual sync operation is 
        // protected by middleware which ensures they manage the source outlet.
        if (membership.permissions?.can_sync_menu) {
            outlets = await Outlet.find({
                brand_id: brandId,
                approval_status: 'APPROVED'
            })
                .populate('brand_id', 'name')
                .select('_id name address location created_by_user_id brand_id media approval_status');
        } else {
            // If they can't sync, they only see outlets they manage directly
            outlets = await Outlet.find({
                brand_id: brandId,
                approval_status: 'APPROVED',
                $or: [
                    { created_by_user_id: userId },
                    { 'managers.user_id': userId }
                ]
            })
                .populate('brand_id', 'name')
                .select('_id name address location created_by_user_id brand_id media approval_status');
        }

        return sendSuccess(res, outlets);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

/**
 * Get user's permissions in a brand
 */
export const getBrandMemberPermissions = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const userId = (req as any).user?.id;

        // Verify brand exists
        const brand = await Brand.findById(brandId);
        if (!brand) {
            return sendError(res, 'Brand not found', 404);
        }

        // Get user's membership
        let membership = await BrandMember.findOne({
            brand_id: brandId,
            user_id: userId
        });

        // If no membership exists, check if user owns any outlets in this brand
        if (!membership) {
            const userOutlets = await Outlet.find({
                brand_id: brandId,
                $or: [
                    { created_by_user_id: userId },
                    { 'managers.user_id': userId }
                ]
            });

            // If user owns outlets, auto-create membership
            if (userOutlets.length > 0) {
                // Check if user is the brand owner
                const isBrandOwner = brand.owner_user_id?.toString() === userId ||
                    brand.admin_user_id?.toString() === userId;

                membership = await BrandMember.create({
                    brand_id: brandId,
                    user_id: userId,
                    role: isBrandOwner ? 'brand_owner' : 'outlet_manager',
                    permissions: {
                        can_sync_menu: true,
                        can_manage_outlets: isBrandOwner,
                        can_manage_members: isBrandOwner
                    }
                });
            }
        }

        if (!membership) {
            return sendSuccess(res, {
                isMember: false,
                role: null,
                permissions: {
                    can_sync_menu: false,
                    can_manage_outlets: false,
                    can_manage_members: false
                }
            });
        }

        return sendSuccess(res, {
            isMember: true,
            role: membership.role,
            permissions: membership.permissions,
            assignedOutlets: membership.assigned_outlets
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

/**
 * Update brand settings (including allow_cross_user_sync)
 */
export const updateBrandSettings = async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { allow_cross_user_sync } = req.body;
        const userId = (req as any).user?.id;

        // Verify brand exists
        const brand = await Brand.findById(brandId);
        if (!brand) {
            return sendError(res, 'Brand not found', 404);
        }

        // Check if user is brand owner
        const membership = await BrandMember.findOne({
            brand_id: brandId,
            user_id: userId
        });

        if (!membership || membership.role !== 'brand_owner') {
            return sendError(res, 'Only brand owners can update brand settings', 403);
        }

        // Update settings
        const updatedBrand = await Brand.findByIdAndUpdate(
            brandId,
            {
                $set: {
                    'settings.allow_cross_user_sync': allow_cross_user_sync
                }
            },
            { new: true }
        );

        return sendSuccess(res, {
            id: updatedBrand?._id,
            settings: updatedBrand?.settings
        }, 'Brand settings updated successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};
