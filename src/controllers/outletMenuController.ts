import { Request, Response } from 'express';
import * as outletMenuService from '../services/menu-management/outletMenuService.js';
import * as outletSubMenuService from '../services/menu-management/outletSubMenuService.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { MenuMapper } from '../mappers/menuMapper.js';
import S3UrlGenerator from '../utils/s3UrlGenerator.js';

const resolveImageUrl = async (value: unknown) => {
    if (!value) return null;
    return await S3UrlGenerator.resolveUrl(String(value));
};

const enrichMenuResponseMedia = async (data: any) => {
    if (!data || !Array.isArray(data.menu)) return data;

    await Promise.all((data.menu || []).map(async (category: any) => {
        const resolvedCategoryImage = await resolveImageUrl(
            category?.category_image_url || category?.image_url || category?.imageUrl
        );

        if (resolvedCategoryImage) {
            category.category_image_url = resolvedCategoryImage;
            category.image_url = resolvedCategoryImage;
            category.imageUrl = resolvedCategoryImage;
        }

        if (!Array.isArray(category?.items)) return;

        await Promise.all(category.items.map(async (item: any) => {
            const resolvedImages = await S3UrlGenerator.resolveUrls(Array.isArray(item?.images) ? item.images : []);
            const normalizedImages = resolvedImages.filter((image): image is string => Boolean(image));
            const resolvedPrimaryImage = await resolveImageUrl(item?.image_url || normalizedImages[0]);

            if (resolvedPrimaryImage) {
                item.image_url = resolvedPrimaryImage;
            }

            item.images = normalizedImages.length > 0
                ? normalizedImages
                : (resolvedPrimaryImage ? [resolvedPrimaryImage] : []);
        }));
    }));

    if (Array.isArray(data.combos)) {
        await Promise.all(data.combos.map(async (combo: any) => {
            const resolvedComboImage = await resolveImageUrl(combo?.image_url);
            if (resolvedComboImage) combo.image_url = resolvedComboImage;

            if (Array.isArray(combo?.items)) {
                await Promise.all(combo.items.map(async (item: any) => {
                    const resolvedItemImage = await resolveImageUrl(item?.image_url);
                    if (resolvedItemImage) item.image_url = resolvedItemImage;
                }));
            }
        }));
    }

    return data;
};

export const getOutletMenu = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const userId = (req as any).user?.id;
        const result = await outletMenuService.getOutletMenu(outletId, req.query, userId);

        // Format combos
        const formattedCombos = result.combos.map(combo => MenuMapper.toComboResponseDto(combo));

        // Flatten or group menu items
        const { sortBy = 'category', search } = req.query;
        let formattedMenu;
        
        if (!search && sortBy === 'category') {
            const grouped = result.menuItems.reduce((acc: Record<string, any>, item) => {
                const categoryId = item.category?._id?.toString() || 'uncategorized';
                const categoryName = item.category?.name || 'Other Items';

                if (!acc[categoryId]) {
                    acc[categoryId] = {
                        _id: item.category?._id,
                        id: categoryId,
                        name: categoryName,
                        slug: item.category?.slug,
                        imageUrl: item.category?.image_url,
                        sortOrder: item.category?.display_order || 999,
                        items: []
                    };
                }

                const userVoteType = result.userVotes.get(item._id.toString()) || null;
                acc[categoryId].items.push(MenuMapper.toFoodItemResponseDto(item, userVoteType));

                return acc;
            }, {});

            formattedMenu = Object.values(grouped).sort((a, b) => (a as any).sortOrder - (b as any).sortOrder);
        } else {
            // For search or other sorts, wrap in a "Results" category to satisfy the mapper
            formattedMenu = [{
                category_id: 'results',
                category_name: search ? `Search Results for "${search}"` : 'All Items',
                category_slug: 'results',
                display_order: 0,
                items: result.menuItems.map(item => {
                    const userVoteType = result.userVotes.get(item._id.toString()) || null;
                    return MenuMapper.toFoodItemResponseDto(item, userVoteType);
                })
            }];
        }

        const resolvedOutletId = String(result.outlet._id);
        const subMenus = await outletSubMenuService.getPublicSubMenus(resolvedOutletId);

        const responseData = MenuMapper.toOutletMenuResponseDto({
            outlet: result.outlet,
            brand: result.outlet.brand_id as any,
            menu_settings: result.outlet.menu_settings,
            menu: formattedMenu,
            combos: formattedCombos,
            sub_menus: subMenus,
            total_items: result.menuItems.length,
            isFollowing: result.isFollowing,
            followersCount: result.followersCount
        });

        await enrichMenuResponseMedia(responseData);

        return sendSuccess(res, responseData);
    } catch (error: unknown) {
        const err = error as any;
        return sendError(res, err.message, null, err.statusCode || 500);
    }
};

export const updateOutletMenuItem = async (req: Request, res: Response) => {
    try {
        const { outletId, foodItemId } = req.params;
        const foodItem = await outletMenuService.updateOutletMenuItem(outletId, foodItemId, req.body);
        return sendSuccess(res, foodItem, 'Food item updated successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const reorderOutletMenu = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { items } = req.body;
        const result = await outletMenuService.reorderOutletMenu(outletId, items);
        return sendSuccess(res, { modified: result.modifiedCount }, 'Menu order updated successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const getOutletMenuCategories = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const categories = await outletMenuService.getOutletMenuCategories(outletId);
        return sendSuccess(res, categories);
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};

export const toggleMenuItemAvailability = async (req: Request, res: Response) => {
    try {
        const { outletId, menuItemId } = req.params;
        const result = await outletMenuService.toggleMenuItemAvailability(outletId, menuItemId);
        return sendSuccess(res, result, 'Availability toggled successfully');
    } catch (error: any) {
        return sendError(res, error.message, null, error.statusCode || 500);
    }
};
