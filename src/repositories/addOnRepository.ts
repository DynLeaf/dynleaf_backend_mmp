import { AddOn } from '../models/AddOn.js';

export const findByOutletId = async (outletId: string) => {
  return await AddOn.find({ outlet_id: outletId }).sort({ display_order: 1, name: 1 }).lean();
};

export const findByOutletAndId = async (outletId: string, addOnId: string) => {
  return await AddOn.findOne({ _id: addOnId, outlet_id: outletId });
};

export const findById = async (id: string) => {
  return await AddOn.findById(id);
};

export const create = async (addOnData: any, session?: any) => {
  return await new AddOn(addOnData).save({ session });
};

export const updateById = async (addOnId: string, updateData: any, session?: any) => {
  return await AddOn.findByIdAndUpdate(addOnId, updateData, { new: true, session });
};

export const deleteById = async (addOnId: string) => {
  return await AddOn.findByIdAndDelete(addOnId);
};
