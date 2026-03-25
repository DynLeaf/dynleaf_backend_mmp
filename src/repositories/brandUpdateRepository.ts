import { BrandUpdateRequest } from '../models/BrandUpdateRequest.js';

export const findPendingRequestsByBrandIds = async (brandIds: string[]) => {
  return await BrandUpdateRequest.find({
    brand_id: { $in: brandIds },
    status: 'pending'
  }).select('brand_id').lean();
};

export const findPendingRequestByBrandId = async (brandId: string) => {
  return await BrandUpdateRequest.findOne({
    brand_id: brandId,
    status: 'pending'
  });
};

export const createRequest = async (data: any) => {
  return await BrandUpdateRequest.create(data);
};
