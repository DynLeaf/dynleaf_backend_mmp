import { Category } from '../models/Category.js';
import mongoose from 'mongoose';
import { FoodItem } from '../models/FoodItem.js';
import { CategoryImage } from '../models/CategoryImage.js';
import { CategorySlugMap } from '../models/CategorySlugMap.js';

export const findByOutletId = async (outletId: string) => {
  return await Category.find({ outlet_id: outletId }).sort({ display_order: 1, name: 1 }).lean();
};

export const countDocuments = async (query: any) => {
  return await Category.countDocuments(query);
};

export const findCategoriesForOutletOrBrand = async (categoryIds: string[], outletId: string, brandId: string) => {
  return await Category.find({
    _id: { $in: categoryIds },
    $or: [{ outlet_id: outletId }, { brand_id: brandId }]
  }).select('_id name slug').lean();
};

export const findById = async (categoryId: string) => {
  return await Category.findById(categoryId);
};

export const findByIdLean = async (categoryId: string) => {
  return await Category.findById(categoryId).lean();
};

export const findByOutletAndId = async (outletId: string, categoryId: string) => {
  return await Category.findOne({ _id: categoryId, outlet_id: outletId });
};

export const findByOutletAndSlug = async (outletId: string, slug: string, excludeId?: string) => {
  const query: any = { outlet_id: outletId, slug };
  if (excludeId) query._id = { $ne: excludeId };
  return await Category.findOne(query);
};

export const create = async (categoryData: any, session?: any) => {
  return await new Category(categoryData).save({ session });
};

export const updateById = async (categoryId: string, updateData: any, session?: any) => {
  return await Category.findByIdAndUpdate(categoryId, updateData, { new: true, session });
};

export const deleteById = async (categoryId: string) => {
  return await Category.findByIdAndDelete(categoryId);
};

export const countItemsInCategory = async (outletId: string, categoryId: string) => {
  return await FoodItem.countDocuments({ outlet_id: outletId, category_id: categoryId });
};

export const getCategoryItemCounts = async (outletId: string) => {
  return await FoodItem.aggregate([
    { $match: { outlet_id: new mongoose.Types.ObjectId(outletId) } },
    { $group: { _id: '$category_id', count: { $sum: 1 } } }
  ]);
};
export const findCategoryImageById = async (imageId: string) => {
  return await CategoryImage.findById(imageId).select('image_url').lean();
};

export const findAndUpsertSlugMap = async (slug: string) => {
  return await CategorySlugMap.findOneAndUpdate(
    { slug },
    { $setOnInsert: { slug, itemKey: null } },
    { upsert: true, new: true }
  ).lean();
};
