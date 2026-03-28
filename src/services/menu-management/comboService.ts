import * as comboRepo from '../../repositories/comboRepository.js';
import * as foodItemRepo from '../../repositories/foodItemRepository.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';

// Maps a raw DB combo document to the camelCase shape expected by the frontend
const formatComboForFrontend = (combo: any) => {
    if (!combo) return combo;
    return {
        id: String(combo._id),
        comboType: combo.combo_type || 'offer',
        name: combo.name,
        description: combo.description || '',
        image: combo.image_url || '',
        price: combo.price || 0,
        originalPrice: combo.original_price || 0,
        discountPercentage: combo.discount_percentage || 0,
        manualPriceOverride: combo.manual_price_override || false,
        isAvailable: combo.is_active ?? true,
        displayOrder: combo.display_order || 0,
        slug: combo.slug || '',
        // Offer combo items: shape to match frontend { itemId, itemName, quantity }
        items: (combo.items || []).map((it: any) => ({
            itemId: it.food_item_id ? String(it.food_item_id) : (it.itemId || ''),
            itemName: it.item_name || it.itemName || '',
            quantity: it.quantity || 1,
        })),
        // Regular combo custom items: shape to match frontend { itemName, itemImage, itemQuantity }
        customItems: (combo.custom_items || []).map((ci: any) => ({
            itemName: ci.item_name || ci.itemName || '',
            itemImage: ci.item_image || ci.itemImage || '',
            itemQuantity: ci.item_quantity ?? ci.itemQuantity ?? 1,
        })),
    };
};

export const listCombos = async (outletId: string) => {
    const combos = await comboRepo.findByOutletId(outletId);
    return combos.map(formatComboForFrontend);
};

export const getComboById = async (outletId: string, comboId: string) => {
    const combo = await comboRepo.findByOutletAndId(outletId, comboId);
    if (!combo) throw new AppError('Combo not found', 404, ErrorCode.RESOURCE_NOT_FOUND);
    return formatComboForFrontend(combo);
};

export const computeComboPricing = async (items: Array<{ foodItemId: string; quantity: number }>, discountPercentage: number) => {
    const foodItemIds = items.map(i => i.foodItemId).filter(Boolean);
    if (foodItemIds.length === 0) return { originalPrice: 0, discountedPrice: 0 };

    const foodItems = await foodItemRepo.findByIds(foodItemIds);
    const priceById = new Map(foodItems.map((fi: { _id: { toString: () => string }; price?: number }) => [fi._id.toString(), fi.price || 0]));

    const originalPrice = items.reduce((sum, i) => {
        const basePrice = priceById.get(i.foodItemId) ?? 0;
        return sum + basePrice * i.quantity;
    }, 0);

    const discountedPrice = Math.max(0, originalPrice * (1 - (discountPercentage || 0) / 100));
    return { originalPrice, discountedPrice };
};

export const createCombo = async (outletId: string, comboData: Record<string, any>) => {
    const comboType: 'offer' | 'regular' = comboData.comboType === 'regular' ? 'regular' : 'offer';
    const discountPercentage = Math.round(comboData.discountPercentage || 0);
    const price = Math.round(comboData.price || 0);
    const manualPriceOverride = comboData.manualPriceOverride || false;

    let originalPrice = Math.round(comboData.originalPrice || 0);
    let normalizedItems: any[] = [];
    let normalizedCustomItems: any[] = [];

    if (comboType === 'offer') {
        // For offer combos: normalize items array and compute pricing
        normalizedItems = (comboData.items || []).map((i: any) => ({
            food_item_id: i.foodItemId ?? i.itemId ?? i.food_item_id,
            item_name: i.itemName || i.item_name || '',
            quantity: i.quantity || 1,
        })).filter((i: any) => i.food_item_id);

        if (normalizedItems.length > 0) {
            const computed = await computeComboPricing(
                normalizedItems.map((i: any) => ({ foodItemId: String(i.food_item_id), quantity: i.quantity })),
                discountPercentage
            );
            originalPrice = Math.round(computed.originalPrice);
        }
    } else {
        // For regular combos: normalize custom_items
        normalizedCustomItems = (comboData.customItems || []).map((ci: any) => ({
            item_name: ci.itemName || ci.item_name || '',
            item_image: ci.itemImage || ci.item_image || '',
            item_quantity: ci.itemQuantity ?? ci.item_quantity ?? 1,
        }));
    }

    const data: Record<string, unknown> = {
        outlet_id: outletId,
        combo_type: comboType,
        name: comboData.name,
        description: comboData.description || '',
        image_url: comboData.image || comboData.image_url || '',
        items: normalizedItems,
        custom_items: normalizedCustomItems,
        original_price: originalPrice,
        price,
        discount_percentage: discountPercentage,
        manual_price_override: manualPriceOverride,
        is_active: comboData.isAvailable ?? comboData.isActive ?? true,
        display_order: comboData.displayOrder || comboData.display_order || 0,
        food_type: comboData.food_type || '',
    };

    const created = await comboRepo.create(data);
    return formatComboForFrontend(created);
};

export const updateCombo = async (outletId: string, comboId: string, updateData: Record<string, any>) => {
    const combo = await comboRepo.findByOutletAndId(outletId, comboId);
    if (!combo) throw new AppError('Combo not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const comboType: 'offer' | 'regular' = updateData.comboType === 'regular' ? 'regular' : (combo.combo_type || 'offer');
    const discountPercentage = updateData.discountPercentage !== undefined
        ? Math.round(updateData.discountPercentage)
        : combo.discount_percentage;

    const updates: Record<string, unknown> = {};

    if (updateData.name !== undefined) updates.name = updateData.name;
    if (updateData.description !== undefined) updates.description = updateData.description;
    if (updateData.image !== undefined) updates.image_url = updateData.image;
    if (updateData.image_url !== undefined) updates.image_url = updateData.image_url;
    if (updateData.comboType !== undefined) updates.combo_type = comboType;
    if (updateData.isAvailable !== undefined) updates.is_active = updateData.isAvailable;
    if (updateData.isActive !== undefined) updates.is_active = updateData.isActive;
    if (updateData.price !== undefined) updates.price = Math.round(updateData.price);
    if (updateData.discountPercentage !== undefined) updates.discount_percentage = discountPercentage;
    if (updateData.manualPriceOverride !== undefined) updates.manual_price_override = updateData.manualPriceOverride;
    if (updateData.displayOrder !== undefined) updates.display_order = updateData.displayOrder;

    if (comboType === 'offer' && updateData.items !== undefined) {
        const normalizedItems = (updateData.items as any[]).map((i: any) => ({
            food_item_id: i.foodItemId ?? i.itemId ?? i.food_item_id,
            item_name: i.itemName || i.item_name || '',
            quantity: i.quantity || 1,
        })).filter((i: any) => i.food_item_id);

        updates.items = normalizedItems;

        if (normalizedItems.length > 0) {
            const { originalPrice } = await computeComboPricing(
                normalizedItems.map((i: any) => ({ foodItemId: String(i.food_item_id), quantity: i.quantity })),
                discountPercentage
            );
            updates.original_price = Math.round(originalPrice);
        }
    }

    if (comboType === 'regular' && updateData.customItems !== undefined) {
        updates.custom_items = (updateData.customItems as any[]).map((ci: any) => ({
            item_name: ci.itemName || ci.item_name || '',
            item_image: ci.itemImage || ci.item_image || '',
            item_quantity: ci.itemQuantity ?? ci.item_quantity ?? 1,
        }));
        // Regular combos have no originalPrice computation
        updates.original_price = 0;
    }

    const updated = await comboRepo.updateById(comboId, updates);
    return formatComboForFrontend(updated);
};

export const deleteCombo = async (outletId: string, comboId: string) => {
    const combo = await comboRepo.findByOutletAndId(outletId, comboId);
    if (!combo) throw new AppError('Combo not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    return await comboRepo.deleteById(comboId);
};
