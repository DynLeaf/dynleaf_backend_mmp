import { FoodVariant } from '../models/FoodVariant.js';

export const create = async (variantData: any, session?: any) => {
    return await new FoodVariant(variantData).save({ session });
};

export const findById = async (id: string) => {
    return await FoodVariant.findById(id);
};

export const findByIdAndUpdate = async (id: string, updateData: any, options: any = { new: true }) => {
    return await FoodVariant.findByIdAndUpdate(id, updateData, options);
};

export const findByFoodItemId = async (foodItemId: string) => {
    return await FoodVariant.find({ food_item_id: foodItemId }).lean();
};
