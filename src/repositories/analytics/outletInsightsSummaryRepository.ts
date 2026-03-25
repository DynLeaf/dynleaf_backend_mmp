import { OutletInsightsSummary } from '../../models/OutletInsightsSummary.js';

export const findOneAndUpdate = async (filter: any, update: any, options: any) => {
    return await OutletInsightsSummary.findOneAndUpdate(filter, update, options);
};

export const findById = async (id: string) => {
    return await OutletInsightsSummary.findById(id);
};

export const deleteMany = async (filter: any) => {
    return await OutletInsightsSummary.deleteMany(filter);
};

export const findOne = async (filter: any) => {
    return await OutletInsightsSummary.findOne(filter);
};

export const find = async (filter: any) => {
    return await OutletInsightsSummary.find(filter);
};
