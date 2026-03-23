import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Outlet } from '../models/Outlet.js';
import { OutletSubMenu } from '../models/OutletSubMenu.js';
import { Category } from '../models/Category.js';
import { Combo } from '../models/Combo.js';
import { Subscription } from '../models/Subscription.js';
import { normalizePlanToTier } from '../config/subscriptionPlans.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const toSlug = (value: string): string =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/(^-|-$)/g, '');

/**
 * Verify the requesting user owns (or manages) this outlet.
 * Returns the outlet if access is granted, null otherwise.
 */
const verifyOutletAccess = async (outletId: string, userId: string) => {
    const outlet = await Outlet.findById(outletId);
    if (!outlet) return null;

    const isOwner = outlet.created_by_user_id?.toString() === userId;
    const isManager = (outlet.managers || []).some(
        (m: any) => m.user_id?.toString() === userId
    );

    if (!isOwner && !isManager) return null;
    return outlet;
};

/**
 * Check if the outlet has an active subscription with multi_menu feature.
 */
const hasMultiMenuSubscription = async (outletId: string): Promise<boolean> => {
    const sub = await Subscription.findOne({ outlet_id: outletId }).lean();
    if (!sub) return false;
    if (!['active', 'trial'].includes(sub.status)) return false;
    const tier = normalizePlanToTier(sub.plan);
    if (tier !== 'premium') return false;
    return sub.features.includes('multi_menu');
};

// ─── Public helper (used by outletMenuController) ───────────────────────────

/**
 * Returns sub-menus with category info for public menu API.
 * Returns [] if subscription is inactive — caller should hide switcher in that case.
 */
export const getPublicSubMenus = async (outletId: string) => {
    const eligible = await hasMultiMenuSubscription(outletId);
    if (!eligible) return [];

    const subMenus = await OutletSubMenu.find({
        outlet_id: new mongoose.Types.ObjectId(outletId),
        is_active: true
    })
        .sort({ display_order: 1 })
        .lean();

    return subMenus;
};

// ─── Owner CRUD ──────────────────────────────────────────────────────────────

/**
 * GET /api/v1/outlets/:outletId/sub-menus
 * List all sub-menus for this outlet (owner only).
 * Also returns subscription eligibility status.
 */
export const listSubMenus = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const userId = (req as any).user?.id;

        const outlet = await verifyOutletAccess(outletId, userId);
        if (!outlet) {
            return res.status(404).json({ status: false, message: 'Outlet not found or access denied' });
        }

        const isEligible = await hasMultiMenuSubscription(outletId);

        const subMenus = await OutletSubMenu.find({ outlet_id: outletId })
            .sort({ display_order: 1 })
            .lean();

        return res.json({
            status: true,
            data: {
                sub_menus: subMenus,
                is_eligible: isEligible,
                ask_submenu_on_scan: outlet.multi_menu_settings?.ask_submenu_on_scan ?? false
            }
        });
    } catch (error: any) {
        console.error('[SubMenu] listSubMenus error:', error);
        return res.status(500).json({ status: false, message: error.message || 'Failed to list sub-menus' });
    }
};

/**
 * POST /api/v1/outlets/:outletId/sub-menus
 * Create a new sub-menu (owner only, subscription required).
 */
export const createSubMenu = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const userId = (req as any).user?.id;
        const { name, description, category_ids = [], combo_ids = [] } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ status: false, message: 'Sub-menu name is required' });
        }

        const outlet = await verifyOutletAccess(outletId, userId);
        if (!outlet) {
            return res.status(404).json({ status: false, message: 'Outlet not found or access denied' });
        }

        const isEligible = await hasMultiMenuSubscription(outletId);
        if (!isEligible) {
            return res.status(403).json({
                status: false,
                message: 'Multi-Menu feature requires an active premium subscription'
            });
        }

        const slug = toSlug(name);

        // Check slug uniqueness within this outlet
        const existing = await OutletSubMenu.findOne({ outlet_id: outletId, slug });
        if (existing) {
            return res.status(409).json({ status: false, message: 'A sub-menu with this name already exists' });
        }

        // Determine display order (append to end)
        const count = await OutletSubMenu.countDocuments({ outlet_id: outletId });

        // Validate category_ids belong to this outlet or its brand
        let validCategoryIds: mongoose.Types.ObjectId[] = [];
        if (category_ids && category_ids.length > 0) {
            const outletWithBrand = await Outlet.findById(outletId).select('brand_id').lean();
            const brandId = (outletWithBrand as any)?.brand_id;

            const cats = await Category.find({
                _id: { $in: category_ids },
                $or: [
                    { outlet_id: outletId },
                    { brand_id: brandId }
                ]
            }).select('_id').lean();
            validCategoryIds = cats.map((c: any) => c._id);
        }

        // Validate combo_ids belong to this outlet
        let validComboIds: mongoose.Types.ObjectId[] = [];
        if (combo_ids && combo_ids.length > 0) {
            const combos = await Combo.find({
                _id: { $in: combo_ids },
                outlet_id: outletId
            }).select('_id').lean();
            validComboIds = combos.map((c: any) => c._id);
        }

        const subMenu = await OutletSubMenu.create({
            outlet_id: new mongoose.Types.ObjectId(outletId),
            name: name.trim(),
            slug,
            description: description?.trim(),
            display_order: count,
            is_active: true,
            category_ids: validCategoryIds,
            combo_ids: validComboIds
        });

        // Update denormalized flag on outlet
        await Outlet.findByIdAndUpdate(outletId, {
            'multi_menu_settings.has_sub_menus': true
        });

        return res.status(201).json({ status: true, data: subMenu, message: 'Sub-menu created successfully' });
    } catch (error: any) {
        console.error('[SubMenu] createSubMenu error:', error);
        return res.status(500).json({ status: false, message: error.message || 'Failed to create sub-menu' });
    }
};

/**
 * PUT /api/v1/outlets/:outletId/sub-menus/:subMenuId
 * Update name, description, icon, or active status.
 */
export const updateSubMenu = async (req: Request, res: Response) => {
    try {
        const { outletId, subMenuId } = req.params;
        const userId = (req as any).user?.id;

        const outlet = await verifyOutletAccess(outletId, userId);
        if (!outlet) {
            return res.status(404).json({ status: false, message: 'Outlet not found or access denied' });
        }

        const isEligible = await hasMultiMenuSubscription(outletId);
        if (!isEligible) {
            return res.status(403).json({ status: false, message: 'Multi-Menu feature requires an active premium subscription' });
        }

        const { name, description, is_active } = req.body;

        const subMenu = await OutletSubMenu.findOne({ _id: subMenuId, outlet_id: outletId });
        if (!subMenu) {
            return res.status(404).json({ status: false, message: 'Sub-menu not found' });
        }

        if (name && name.trim() !== subMenu.name) {
            const newSlug = toSlug(name);
            const conflict = await OutletSubMenu.findOne({
                outlet_id: outletId,
                slug: newSlug,
                _id: { $ne: subMenuId }
            });
            if (conflict) {
                return res.status(409).json({ status: false, message: 'A sub-menu with this name already exists' });
            }
            subMenu.name = name.trim();
            subMenu.slug = newSlug;
        }

        if (description !== undefined) subMenu.description = description?.trim();
        if (is_active !== undefined) subMenu.is_active = Boolean(is_active);

        await subMenu.save();

        // If all sub-menus are deleted/deactivated, sync the outlet flag
        const activeCount = await OutletSubMenu.countDocuments({ outlet_id: outletId, is_active: true });
        await Outlet.findByIdAndUpdate(outletId, {
            'multi_menu_settings.has_sub_menus': activeCount > 0
        });

        return res.json({ status: true, data: subMenu, message: 'Sub-menu updated successfully' });
    } catch (error: any) {
        console.error('[SubMenu] updateSubMenu error:', error);
        return res.status(500).json({ status: false, message: error.message || 'Failed to update sub-menu' });
    }
};

/**
 * DELETE /api/v1/outlets/:outletId/sub-menus/:subMenuId
 */
export const deleteSubMenu = async (req: Request, res: Response) => {
    try {
        const { outletId, subMenuId } = req.params;
        const userId = (req as any).user?.id;

        const outlet = await verifyOutletAccess(outletId, userId);
        if (!outlet) {
            return res.status(404).json({ status: false, message: 'Outlet not found or access denied' });
        }

        const subMenu = await OutletSubMenu.findOneAndDelete({ _id: subMenuId, outlet_id: outletId });
        if (!subMenu) {
            return res.status(404).json({ status: false, message: 'Sub-menu not found' });
        }

        // Sync outlet flag
        const remaining = await OutletSubMenu.countDocuments({ outlet_id: outletId, is_active: true });
        await Outlet.findByIdAndUpdate(outletId, {
            'multi_menu_settings.has_sub_menus': remaining > 0
        });

        return res.json({ status: true, message: 'Sub-menu deleted successfully' });
    } catch (error: any) {
        console.error('[SubMenu] deleteSubMenu error:', error);
        return res.status(500).json({ status: false, message: error.message || 'Failed to delete sub-menu' });
    }
};

/**
 * PUT /api/v1/outlets/:outletId/sub-menus/:subMenuId/categories
 * Assign/replace category_ids + combo_ids for a sub-menu.
 * Body: { category_ids?: string[], combo_ids?: string[] }
 */
export const updateSubMenuCategories = async (req: Request, res: Response) => {
    try {
        const { outletId, subMenuId } = req.params;
        const userId = (req as any).user?.id;
        const { category_ids = [], combo_ids = [] } = req.body;

        const outlet = await verifyOutletAccess(outletId, userId);
        if (!outlet) {
            return res.status(404).json({ status: false, message: 'Outlet not found or access denied' });
        }

        const isEligible = await hasMultiMenuSubscription(outletId);
        if (!isEligible) {
            return res.status(403).json({ status: false, message: 'Multi-Menu feature requires an active premium subscription' });
        }

        const subMenu = await OutletSubMenu.findOne({ _id: subMenuId, outlet_id: outletId });
        if (!subMenu) {
            return res.status(404).json({ status: false, message: 'Sub-menu not found' });
        }

        // Validate categories belong to this outlet (either by outlet_id or brand_id)
        const outletWithBrand = await Outlet.findById(outletId).select('brand_id').lean();
        const brandId = (outletWithBrand as any)?.brand_id;

        const validCats = await Category.find({
            _id: { $in: category_ids },
            $or: [
                { outlet_id: outletId },
                { brand_id: brandId }
            ]
        }).select('_id name slug').lean();

        // Validate combos belong to this outlet
        const validCombos = await Combo.find({
            _id: { $in: combo_ids },
            outlet_id: outletId
        }).select('_id name').lean();

        subMenu.category_ids = validCats.map((c: any) => c._id);
        subMenu.combo_ids = validCombos.map((c: any) => c._id);
        await subMenu.save();

        return res.json({
            status: true,
            data: {
                sub_menu_id: subMenuId,
                assigned_categories: validCats,
                assigned_combos: validCombos
            },
            message: 'Sub-menu categories and combos assigned successfully'
        });
    } catch (error: any) {
        console.error('[SubMenu] updateSubMenuCategories error:', error);
        return res.status(500).json({ status: false, message: error.message || 'Failed to update categories' });
    }
};

/**
 * PUT /api/v1/outlets/:outletId/sub-menus/reorder
 * Body: { order: [{ id: string, display_order: number }] }
 */
export const reorderSubMenus = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const userId = (req as any).user?.id;
        const { order } = req.body;

        const outlet = await verifyOutletAccess(outletId, userId);
        if (!outlet) {
            return res.status(404).json({ status: false, message: 'Outlet not found or access denied' });
        }

        if (!Array.isArray(order) || order.length === 0) {
            return res.status(400).json({ status: false, message: 'order array is required' });
        }

        const bulkOps = order.map((item: { id: string; display_order: number }) => ({
            updateOne: {
                filter: {
                    _id: new mongoose.Types.ObjectId(item.id),
                    outlet_id: new mongoose.Types.ObjectId(outletId)
                },
                update: { $set: { display_order: item.display_order } }
            }
        }));

        await OutletSubMenu.bulkWrite(bulkOps);

        return res.json({ status: true, message: 'Sub-menu order updated' });
    } catch (error: any) {
        console.error('[SubMenu] reorderSubMenus error:', error);
        return res.status(500).json({ status: false, message: error.message || 'Failed to reorder sub-menus' });
    }
};

/**
 * PUT /api/v1/outlets/:outletId/multi-menu-settings
 * Toggle ask_submenu_on_scan.
 * Body: { ask_submenu_on_scan: boolean }
 */
export const updateMultiMenuSettings = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const userId = (req as any).user?.id;
        const { ask_submenu_on_scan } = req.body;

        const outlet = await verifyOutletAccess(outletId, userId);
        if (!outlet) {
            return res.status(404).json({ status: false, message: 'Outlet not found or access denied' });
        }

        const isEligible = await hasMultiMenuSubscription(outletId);
        if (!isEligible) {
            return res.status(403).json({ status: false, message: 'Multi-Menu feature requires an active premium subscription' });
        }

        if (typeof ask_submenu_on_scan !== 'boolean') {
            return res.status(400).json({ status: false, message: 'ask_submenu_on_scan must be a boolean' });
        }

        const updated = await Outlet.findByIdAndUpdate(
            outletId,
            { 'multi_menu_settings.ask_submenu_on_scan': ask_submenu_on_scan },
            { new: true }
        ).select('multi_menu_settings');

        return res.json({
            status: true,
            data: updated?.multi_menu_settings,
            message: `"Ask to choose sub-menu on scan" ${ask_submenu_on_scan ? 'enabled' : 'disabled'}`
        });
    } catch (error: any) {
        console.error('[SubMenu] updateMultiMenuSettings error:', error);
        return res.status(500).json({ status: false, message: error.message || 'Failed to update settings' });
    }
};
