import { OperatingHours } from '../models/OperatingHours.js';

export const saveOperatingHours = async (outletId: string, hours: any[]) => {
  await OperatingHours.deleteMany({ outlet_id: outletId });
  return await OperatingHours.insertMany(hours);
};

export const getOperatingHoursByOutletId = async (outletId: string) => {
  return await OperatingHours.find({ outlet_id: outletId }).sort({ day_of_week: 1 }).lean();
};

export const getOperatingHoursByOutletIds = async (outletIds: string[]) => {
  return await OperatingHours.find({ outlet_id: { $in: outletIds } }).sort({ day_of_week: 1 }).lean();
};
