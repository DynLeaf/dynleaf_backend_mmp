import { Combo } from '../models/Combo.js';
import mongoose from 'mongoose';

export const findByOutletId = async (outletId: string) => {
  return await Combo.find({ outlet_id: outletId }).sort({ display_order: 1, name: 1 }).lean();
};

export const findByOutletAndId = async (outletId: string, comboId: string) => {
  return await Combo.findOne({ _id: comboId, outlet_id: outletId });
};

export const findById = async (id: string) => {
  return await Combo.findById(id);
};

export const findByIds = async (ids: string[]) => {
  return await Combo.find({ _id: { $in: ids } })
    .select('name image_url outlet_id combo_type description items custom_items price original_price discount_percentage manual_price_override is_active display_order')
    .lean();
};

export const create = async (comboData: any, session?: any) => {
  return await new Combo(comboData).save({ session });
};

export const updateById = async (comboId: string, updateData: any, session?: any) => {
  return await Combo.findByIdAndUpdate(comboId, updateData, { new: true, session });
};

export const deleteById = async (comboId: string) => {
  return await Combo.findByIdAndDelete(comboId);
};

export const countByFoodItem = async (outletId: string, foodItemId: string) => {
  return await Combo.countDocuments({
    outlet_id: outletId,
    'items.food_item_id': foodItemId
  });
};

export const distinctFoodItemIds = async (filter: any) => {
  return await Combo.distinct('items.food_item_id', filter);
};

export const findActiveCombosWithItems = async (outletId: string) => {
  return await Combo.find({
    outlet_id: new mongoose.Types.ObjectId(outletId),
    is_active: true
  }).populate('items.food_item_id').sort({ display_order: 1, order_count: -1 }).lean();
};
