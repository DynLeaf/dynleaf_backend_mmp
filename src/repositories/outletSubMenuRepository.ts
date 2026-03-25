import { OutletSubMenu } from '../models/OutletSubMenu.js';
import mongoose from 'mongoose';

export const findByOutletId = async (outletId: string, activeOnly: boolean = false) => {
    const query: any = { outlet_id: new mongoose.Types.ObjectId(outletId) };
    if (activeOnly) query.is_active = true;
    return await OutletSubMenu.find(query).sort({ display_order: 1 }).lean();
};

export const findById = async (id: string, outletId?: string) => {
    const query: any = { _id: id };
    if (outletId) query.outlet_id = outletId;
    return await OutletSubMenu.findOne(query);
};

export const create = async (data: any) => {
    return await OutletSubMenu.create(data);
};

export const findByIdAndUpdate = async (id: string, outletId: string, updateData: any) => {
    return await OutletSubMenu.findOneAndUpdate(
        { _id: id, outlet_id: outletId },
        { $set: updateData },
        { new: true }
    );
};

export const findByIdAndDelete = async (id: string, outletId: string) => {
    return await OutletSubMenu.findOneAndDelete({ _id: id, outlet_id: outletId });
};

export const countDocuments = async (filter: any) => {
    return await OutletSubMenu.countDocuments(filter);
};

export const bulkWrite = async (ops: any[]) => {
    return await OutletSubMenu.bulkWrite(ops);
};

export const findOne = async (filter: any) => {
    return await OutletSubMenu.findOne(filter).lean();
};
