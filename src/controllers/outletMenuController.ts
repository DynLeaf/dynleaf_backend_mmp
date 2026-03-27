import { Request, Response } from 'express';
import * as outletMenuService from '../services/menu-management/outletMenuService.js';
import * as outletSubMenuService from '../services/menu-management/outletSubMenuService.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { MenuMapper } from '../mappers/menuMapper.js';

export const getOutletMenu = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const userId = (req as any).user?.id;
        const result = await outletMenuService.getOutletMenu(outletId, req.query, userId);

        // Format combos
        const formattedCombos = result.combos.map((combo) => ({
            _id: combo._id,
            id: combo._id.toString(),
            combo_type: combo.combo_type || 'offer',
            name: combo.name,
            slug: combo.slug,
            description: combo.description,
            image_url: combo.image_url,
            combo_price: combo.price,
            is_available: combo.is_active,
            avg_rating: combo.avg_rating,
            total_votes: combo.total_votes,
            order_count: combo.order_count,
            items: (combo.items || []).map((item) => ({
                food_item_id: (item.food_item_id as any)?._id,
                name: (item.food_item_id as any)?.name,
                image_url: (item.food_item_id as any)?.image_url,
                food_type: (item.food_item_id as any)?.food_type,
                quantity: item.quantity,
                individual_price: (item.food_item_id as any)?.price
            })),
            original_price: combo.original_price,
            discount_percentage: combo.discount_percentage,
            food_type: combo.food_type
        }));

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

                acc[categoryId].items.push({
                    _id: item._id,
                    id: item._id.toString(),
                    name: item.name,
                    slug: item.slug,
                    description: item.description,
                    image_url: item.image_url,
                    price: item.price,
                    is_available: item.is_available,
                    avg_rating: item.avg_rating,
                    upvote_count: item.upvote_count || 0,
                    user_vote_type: result.userVotes.get(item._id.toString()) || null,
                    addons: item.addons || [],
                    variants: item.variants || []
                });

                return acc;
            }, {});

            formattedMenu = Object.values(grouped).sort((a, b) => (a as any).sortOrder - (b as any).sortOrder);
        } else {
            formattedMenu = result.menuItems.map(item => ({
                _id: item._id,
                id: item._id.toString(),
                name: item.name,
                slug: item.slug,
                description: item.description,
                image_url: item.image_url,
                price: item.price,
                is_available: item.is_available,
                user_vote_type: result.userVotes.get(item._id.toString()) || null
            }));
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
