import * as comboRepo from '../../repositories/comboRepository.js';
import * as foodItemRepo from '../../repositories/foodItemRepository.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';

export const listCombos = async (outletId: string) => {
  return await comboRepo.findByOutletId(outletId);
};

export const getComboById = async (outletId: string, comboId: string) => {
    const combo = await comboRepo.findByOutletAndId(outletId, comboId);
    if (!combo) throw new AppError('Combo not found', 404, ErrorCode.RESOURCE_NOT_FOUND);
    return combo;
};

export const computeComboPricing = async (items: Array<{ foodItemId: string; quantity: number }>, discountPercentage: number) => {
    const foodItemIds = items.map(i => i.foodItemId);
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
    const { items, discountPercentage = 0, price, manualPriceOverride = false } = comboData;
    
    const normalizedItems = (items || []).map((i: { foodItemId?: string; itemId?: string; food_item_id?: string; quantity: number }) => ({
        food_item_id: i.foodItemId ?? i.itemId ?? i.food_item_id,
        quantity: i.quantity
    }));

    const { originalPrice } = await computeComboPricing(
        normalizedItems.map((i: any) => ({ foodItemId: i.food_item_id, quantity: i.quantity })), 
        discountPercentage
    );

    const data: Record<string, unknown> = {
        ...comboData,
        outlet_id: outletId,
        items: normalizedItems,
        original_price: Math.round(originalPrice),
        price: Math.round(price || 0),
        discount_percentage: Math.round(discountPercentage),
        manual_price_override: manualPriceOverride,
        is_active: comboData.isActive ?? true
    };
    return await comboRepo.create(data);
};

export const updateCombo = async (outletId: string, comboId: string, updateData: Record<string, any>) => {
    const combo = await comboRepo.findByOutletAndId(outletId, comboId);
    if (!combo) throw new AppError('Combo not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const updates: Record<string, unknown> = { ...updateData };
    
    const items = updateData.items || combo.items;
    const discountPercentage = updateData.discountPercentage !== undefined ? updateData.discountPercentage : combo.discount_percentage;

    const normalizedItems = (items as any[]).map((i: any) => ({
        foodItemId: i.foodItemId ?? i.itemId ?? i.food_item_id,
        quantity: i.quantity
    }));

    const { originalPrice } = await computeComboPricing(normalizedItems, discountPercentage);
    updates.original_price = Math.round(originalPrice);

    if (updateData.items) {
        updates.items = normalizedItems.map((i: any) => ({
            food_item_id: i.foodItemId,
            quantity: i.quantity
        }));
    }

    if (updateData.discountPercentage !== undefined) updates.discount_percentage = Math.round(updateData.discountPercentage);
    if (updateData.isActive !== undefined) updates.is_active = updateData.isActive;
    if (updateData.price !== undefined) updates.price = Math.round(updateData.price);

    return await comboRepo.updateById(comboId, updates);
};

export const deleteCombo = async (outletId: string, comboId: string) => {
    const combo = await comboRepo.findByOutletAndId(outletId, comboId);
    if (!combo) throw new AppError('Combo not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    return await comboRepo.deleteById(comboId);
};
