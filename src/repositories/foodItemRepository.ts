import { FoodItem } from '../models/FoodItem.js';
import mongoose from 'mongoose';

export const findByOutletId = async (outletId: string, query: any = {}, sortOptions: any = {}, skip: number = 0, limit: number = 0) => {
  return await FoodItem.find({ ...query, outlet_id: outletId })
    .sort(sortOptions)
    .skip(skip)
    .limit(limit)
    .lean();
};

export const countDocuments = async (query: any) => {
  return await FoodItem.countDocuments(query);
};

export const findByOutletAndId = async (outletId: string, foodItemId: string) => {
  return await FoodItem.findOne({ _id: foodItemId, outlet_id: outletId });
};

export const findById = async (id: string) => {
  return await FoodItem.findById(id);
};

export const findBySlug = async (slug: string) => {
  return await FoodItem.findOne({ slug });
};

export const findByIdLean = async (id: string) => {
  return await FoodItem.findById(id).lean();
};

export const findByIdsLean = async (ids: string[]) => {
  return await FoodItem.find({ _id: { $in: ids } }).lean();
};

export const findByIds = async (ids: string[]) => {
  return await FoodItem.find({ _id: { $in: ids } })
    .select('name slug image_url outlet_id category_id item_number addon_ids description item_type is_veg price tax_percentage is_active is_available tags variants preparation_time calories spice_level allergens is_featured is_recommended discount_percentage display_order price_display_type')
    .lean();
};

export const create = async (foodItemData: any, session?: any) => {
  return await new FoodItem(foodItemData).save({ session });
};

export const updateById = async (foodItemId: string, updateData: any, session?: any) => {
  return await FoodItem.findByIdAndUpdate(foodItemId, updateData, { new: true, session });
};

export const deleteById = async (foodItemId: string) => {
  return await FoodItem.findByIdAndDelete(foodItemId);
};

export const updateMany = async (filter: any, update: any) => {
  return await FoodItem.updateMany(filter, update);
};

export const bulkUpdate = async (itemIds: string[], outletId: string, sanitizedUpdates: any) => {
  return await FoodItem.updateMany(
    { _id: { $in: itemIds }, outlet_id: outletId },
    { $set: sanitizedUpdates }
  );
};

export const aggregateFoodItems = async (pipeline: mongoose.PipelineStage[]) => {
  return await FoodItem.aggregate(pipeline);
};

export const bulkWrite = async (operations: mongoose.AnyBulkWriteOperation<any>[]) => {
  return await FoodItem.bulkWrite(operations);
};

export const findAndUpdateFoodItem = async (outletId: string, foodItemId: string, updateData: any) => {
  return await FoodItem.findOneAndUpdate(
    { _id: foodItemId, outlet_id: outletId },
    { $set: updateData },
    { new: true }
  );
};

export const findActiveItemsWithCategory = async (outletId: string) => {
  return await FoodItem.find({
    outlet_id: outletId,
    is_active: true,
    is_available: true
  }).populate('category_id').lean();
};
