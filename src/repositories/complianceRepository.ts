import { Compliance } from '../models/Compliance.js';

export const saveCompliance = async (outletId: string, complianceData: any) => {
  return await Compliance.findOneAndUpdate(
    { outlet_id: outletId },
    complianceData,
    { new: true, upsert: true }
  );
};

export const getComplianceByOutletId = async (outletId: string) => {
  return await Compliance.findOne({ outlet_id: outletId }).lean();
};
