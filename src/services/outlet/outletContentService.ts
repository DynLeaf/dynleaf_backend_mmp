import * as outletRepo from '../../repositories/outletRepository.js';
import * as complianceRepo from '../../repositories/complianceRepository.js';
import { getS3Service } from '../s3Service.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';

export const saveCompliance = async (outletId: string, complianceData: any) => {
  return await complianceRepo.saveCompliance(outletId, complianceData);
};

export const getCompliance = async (outletId: string) => {
  const compliance = await complianceRepo.getComplianceByOutletId(outletId);
  return {
      fssaiNumber: compliance?.fssai_number || '',
      gstNumber: compliance?.gst_number || '',
      gstPercentage: compliance?.gst_percentage || 0,
      isVerified: compliance?.is_verified || false
  };
};

export const uploadPhotoGallery = async (outletId: string, category: 'interior' | 'exterior' | 'food', finalUrl: string) => {
  const outlet = await outletRepo.findById(outletId);
  if (!outlet) throw new AppError('Outlet not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

  if (!outlet.photo_gallery) {
      outlet.photo_gallery = { interior: [], exterior: [], food: [] };
  }
  if (!outlet.photo_gallery[category]) {
      outlet.photo_gallery[category] = [];
  }
  
  outlet.photo_gallery[category].push(finalUrl);
  await outlet.save();
  return finalUrl;
};

export const deletePhotoGallery = async (outletId: string, category: 'interior' | 'exterior' | 'food', photoUrl: string) => {
  const outlet = await outletRepo.findById(outletId);
  if (!outlet) throw new AppError('Outlet not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

  if (outlet.photo_gallery && outlet.photo_gallery[category]) {
      outlet.photo_gallery[category] = outlet.photo_gallery[category].filter((url: string) => url !== photoUrl);
  }
  await outlet.save();

  if (photoUrl) {
      const s3 = getS3Service();
      await s3.safeDeleteFromUrl(photoUrl, null);
  }
};

export const addInstagramReel = async (outletId: string, url: string, thumbnailUrl?: string) => {
  const outlet = await outletRepo.findById(outletId);
  if (!outlet) throw new AppError('Outlet not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

  if (!outlet.instagram_reels) {
      outlet.instagram_reels = [];
  }
  if (outlet.instagram_reels.length >= 8) {
      throw new AppError('Maximum of 8 reels allowed', 400, ErrorCode.VALIDATION_ERROR);
  }

  outlet.instagram_reels.push({ url, thumbnail: thumbnailUrl, _id: undefined } as any); 
  await outlet.save();
  return outlet.instagram_reels[outlet.instagram_reels.length - 1];
};

export const deleteInstagramReel = async (outletId: string, reelId: string) => {
  const outlet = await outletRepo.findById(outletId);
  if (!outlet) throw new AppError('Outlet not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

  if (outlet.instagram_reels) {
      outlet.instagram_reels = outlet.instagram_reels.filter((r: any) => r._id.toString() !== reelId);
      await outlet.save();
  }
};

export const reorderInstagramReels = async (outletId: string, reelIds: string[]) => {
  const outlet = await outletRepo.findById(outletId);
  if (!outlet) throw new AppError('Outlet not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

  if (outlet.instagram_reels) {
      const reordered = reelIds.map(id => (outlet.instagram_reels as any[]).find((r: any) => r._id.toString() === id)).filter((r): r is any => !!r);
      const remaining = (outlet.instagram_reels as any[]).filter((r: any) => !reelIds.includes(r._id.toString()));
      outlet.instagram_reels = [...reordered, ...remaining] as any;
      await outlet.save();
  }
};

export const toggleFeaturedStatus = async (outletId: string, isFeatured: boolean) => {
  const outlet = await outletRepo.findById(outletId) as any;
  if (!outlet) throw new AppError('Outlet not found', 404, ErrorCode.RESOURCE_NOT_FOUND);
  if (!outlet.flags) outlet.flags = { is_featured: false, is_trending: false, accepts_online_orders: true, is_open_now: true };
  outlet.flags.is_featured = isFeatured;
  await outlet.save();
  return outlet;
};
