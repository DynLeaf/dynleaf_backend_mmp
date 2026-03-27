import mongoose from 'mongoose';
import * as subMenuRepo from '../../repositories/outletSubMenuRepository.js';
import * as outletRepo from '../../repositories/outletRepository.js';
import * as categoryRepo from '../../repositories/categoryRepository.js';
import * as comboRepo from '../../repositories/comboRepository.js';
import { normalizePlanToTier } from '../../config/subscriptionPlans.js';
import { AppError } from '../../errors/AppError.js';

const toSlug = (value: string): string =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/(^-|-$)/g, '');

const hasMultiMenuSubscription = async (outletId: string): Promise<boolean> => {
    const sub = await outletRepo.findSubscriptionByOutletId(outletId) as { status: string; plan: string; features?: string[] };
    if (!sub) return false;
    if (!['active', 'trial'].includes(sub.status)) return false;
    
    // Check both plan defaults and explicit overrides
    return normalizePlanToTier(sub.plan) === 'premium' || (sub.features || []).includes('multi_menu');
};

export const listSubMenus = async (outletId: string, userId: string) => {
    const outlet = await outletRepo.findBySlugOrId(outletId);
    if (!outlet) throw new AppError('Outlet not found', 404);
    
    // Authorization check
    const isOwner = outlet.created_by_user_id?.toString() === userId;
    const isManager = (outlet.managers as unknown as Array<{ user_id?: mongoose.Types.ObjectId }>)?.some((m) => m.user_id?.toString() === userId);
    if (!isOwner && !isManager) throw new AppError('Access denied', 403);

    const isEligible = await hasMultiMenuSubscription(outletId);
    const subMenus = await subMenuRepo.findByOutletId(outletId);

    return {
        sub_menus: subMenus,
        is_eligible: isEligible,
        ask_submenu_on_scan: (outlet as any).multi_menu_settings?.ask_submenu_on_scan ?? false
    };
};

export const createSubMenu = async (outletId: string, userId: string, data: { name: string; description?: string; category_ids?: string[]; combo_ids?: string[] }) => {
    const { name, description, category_ids = [], combo_ids = [] } = data;
    
    const outlet = await outletRepo.findBySlugOrId(outletId);
    if (!outlet) throw new AppError('Outlet not found', 404);
    
    const isEligible = await hasMultiMenuSubscription(outletId);
    if (!isEligible) throw new AppError('Multi-Menu feature requires an active premium subscription', 403);

    const slug = toSlug(name);
    const existing = await subMenuRepo.findOne({ outlet_id: outletId, slug });
    if (existing) throw new AppError('A sub-menu with this name already exists', 409);

    const count = await subMenuRepo.countDocuments({ outlet_id: outletId });

    // Validate category_ids
    let validCategoryIds: mongoose.Types.ObjectId[] = [];
    if (category_ids.length > 0) {
        const cats = await categoryRepo.findCategoriesForOutletOrBrand(category_ids, outletId, (outlet as any).brand_id.toString());
        validCategoryIds = cats.map((c: any) => c._id as unknown as mongoose.Types.ObjectId);
    }

    // Validate combo_ids
    let validComboIds: mongoose.Types.ObjectId[] = [];
    if (combo_ids.length > 0) {
        const combos = await comboRepo.findByIds(combo_ids);
        validComboIds = combos.filter(c => c.outlet_id.toString() === outletId).map((c: any) => c._id as unknown as mongoose.Types.ObjectId);
    }

    const subMenu = await subMenuRepo.create({
        outlet_id: new mongoose.Types.ObjectId(outletId),
        name: name.trim(),
        slug,
        description: description?.trim(),
        display_order: count,
        is_active: true,
        category_ids: validCategoryIds,
        combo_ids: validComboIds
    });

    await outletRepo.updateById(outletId, { multi_menu_settings: { has_sub_menus: true } } as any);
    return subMenu;
};

export const getPublicSubMenus = async (outletId: string) => {
    const eligible = await hasMultiMenuSubscription(outletId);
    if (!eligible) return [];
    return await subMenuRepo.findByOutletId(outletId, true);
};

export const updateSubMenu = async (outletId: string, subMenuId: string, data: { name?: string; description?: string; is_active?: boolean }) => {
    const { name, description, is_active } = data;
    const subMenu = await subMenuRepo.findById(subMenuId, outletId);
    if (!subMenu) throw new AppError('Sub-menu not found', 404);

    if (name && name.trim() !== subMenu.name) {
        const newSlug = toSlug(name);
        const conflict = await subMenuRepo.findOne({ outlet_id: outletId, slug: newSlug, _id: { $ne: new mongoose.Types.ObjectId(subMenuId) as any } });
        if (conflict) throw new AppError('A sub-menu with this name already exists', 409);
        subMenu.name = name.trim();
        subMenu.slug = newSlug;
    }

    if (description !== undefined) subMenu.description = description?.trim();
    if (is_active !== undefined) subMenu.is_active = Boolean(is_active);

    await subMenu.save();

    const activeCount = await subMenuRepo.countDocuments({ outlet_id: outletId, is_active: true });
    await outletRepo.updateById(outletId, { multi_menu_settings: { has_sub_menus: activeCount > 0 } } as any);

    return subMenu;
};

export const deleteSubMenu = async (outletId: string, subMenuId: string) => {
    const subMenu = await subMenuRepo.findByIdAndDelete(subMenuId, outletId);
    if (!subMenu) throw new AppError('Sub-menu not found', 404);

    const remaining = await subMenuRepo.countDocuments({ outlet_id: outletId, is_active: true });
    await outletRepo.updateById(outletId, { multi_menu_settings: { has_sub_menus: remaining > 0 } } as any);
    return true;
};

export const updateSubMenuCategories = async (outletId: string, subMenuId: string, data: { category_ids?: string[]; combo_ids?: string[] }) => {
    const { category_ids = [], combo_ids = [] } = data;
    const subMenu = await subMenuRepo.findById(subMenuId, outletId);
    if (!subMenu) throw new AppError('Sub-menu not found', 404);

    const outlet = await outletRepo.findBySlugOrId(outletId);
    
    const validCats = await categoryRepo.findCategoriesForOutletOrBrand(category_ids, outletId, (outlet as any)?.brand_id?.toString() || '');
    const validCombos = (await comboRepo.findByIds(combo_ids)).filter(c => c.outlet_id.toString() === outletId);

    subMenu.category_ids = validCats.map((c: any) => c._id as unknown as mongoose.Types.ObjectId);
    subMenu.combo_ids = validCombos.map((c: any) => c._id as unknown as mongoose.Types.ObjectId);
    await subMenu.save();

    return { assigned_categories: validCats, assigned_combos: validCombos };
};

export const reorderSubMenus = async (outletId: string, order: Array<{ id: string, display_order: number }>) => {
    const bulkOps = order.map(item => ({
        updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(item.id) as any, outlet_id: new mongoose.Types.ObjectId(outletId) as any },
            update: { $set: { display_order: item.display_order } }
        }
    })) as mongoose.AnyBulkWriteOperation<any>[];
    return await subMenuRepo.bulkWrite(bulkOps);
};

export const updateMultiMenuSettings = async (outletId: string, settings: { ask_submenu_on_scan: boolean }) => {
    const { ask_submenu_on_scan } = settings;
    if (typeof ask_submenu_on_scan !== 'boolean') throw new AppError('ask_submenu_on_scan must be a boolean', 400);

    const updated = await outletRepo.updateById(
        outletId,
        { multi_menu_settings: { ask_submenu_on_scan } } as any
    );
    return (updated as any)?.multi_menu_settings;
};
