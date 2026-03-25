import * as brandRepo from '../repositories/brandRepository.js';
import * as brandUpdateRepo from '../repositories/brandUpdateRepository.js';
import * as userRepo from '../repositories/userRepository.js';
import { AppError, ErrorCode } from '../errors/AppError.js';

export const getUserBrands = async (userId: string) => {
  const brands = await brandRepo.findByAdminUserId(userId);
  const brandIds = brands.map((b: any) => String(b._id));
  const pendingRequests = await brandUpdateRepo.findPendingRequestsByBrandIds(brandIds);
  const pendingSet = new Set(pendingRequests.map((r: any) => String(r.brand_id)));

  return brands.map((b: any) => ({
    ...b,
    has_pending_update: pendingSet.has(String(b._id))
  }));
};

export const getBrandById = async (brandId: string) => {
  return await brandRepo.findById(brandId);
};

const generateUniqueSlug = async (name: string): Promise<string> => {
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  let existing = await brandRepo.findBySlug(slug);
  let counter = 1;
  while (existing) {
    slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${counter}`;
    existing = await brandRepo.findBySlug(slug);
    counter++;
  }
  return slug;
};

export const createBrand = async (userId: string, brandData: any) => {
  const existingGlobal = await brandRepo.findByNameAndStatus(new RegExp(`^${brandData.name}$`, 'i'), 'approved');
  if (existingGlobal) throw new AppError(`A brand named "${brandData.name}" already exists.`, 400, ErrorCode.VALIDATION_ERROR);

  const existingPending = await brandRepo.findAdminBrandByNameAndStatus(new RegExp(`^${brandData.name}$`, 'i'), userId, 'pending');
  if (existingPending) throw new AppError(`You already have a pending brand named "${brandData.name}".`, 400, ErrorCode.VALIDATION_ERROR);

  const slug = await generateUniqueSlug(brandData.name);

  const brand = await brandRepo.create({
    ...brandData,
    slug,
    admin_user_id: userId,
    created_by: userId,
    verification_status: 'pending',
    is_featured: false
  });

  await userRepo.addRole(userId, {
    scope: 'brand',
    role: 'restaurant_owner',
    brandId: brand._id,
    permissions: [],
    assignedAt: new Date() as any,
    assignedBy: userId
  } as any);

  return brand;
};

export const updateBrand = async (brandId: string, userId: string, updateData: any) => {
  const brand = await brandRepo.findAdminBrand(brandId, userId);
  if (!brand) throw new AppError('Brand not found or unauthorized', 404, ErrorCode.RESOURCE_NOT_FOUND);

  if (updateData.name && updateData.name !== brand.name) {
    const existing = await brandRepo.findByNameAndStatus(new RegExp(`^${updateData.name}$`, 'i'), 'approved', brandId);
    if (existing) throw new AppError(`A brand named "${updateData.name}" already exists.`, 400, ErrorCode.VALIDATION_ERROR);
  }

  const allowedFields = ['name', 'description', 'logo_url', 'cuisines', 'operating_modes', 'social_media', 'verification_status', 'verified_by', 'verified_at', 'brand_theme', 'primary_color', 'secondary_color'];
  allowedFields.forEach(field => {
    if (updateData[field] !== undefined) brand[field] = updateData[field];
  });

  if (updateData.name) {
    brand.slug = updateData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  await brand.save(); // Assuming mongoose model returned
  return brand;
};

const enrichBrandsWithPending = async (brands: any[]) => {
  return await Promise.all(brands.map(async (brand: any) => {
    const pending = await brandUpdateRepo.findPendingRequestByBrandId(brand._id);
    return { ...brand, has_pending_update: !!pending };
  }));
};

export const getPublicBrands = async (userId?: string) => {
  const query = userId ? {
    $or: [{ created_by: userId }, { admin_user_id: userId }, { verification_status: 'approved' }]
  } : { verification_status: 'approved' };
  
  const brands = await brandRepo.searchPublicBrands(query, 50);
  return await enrichBrandsWithPending(brands);
};

export const searchBrands = async (query: string, userId?: string) => {
  const searchQuery = userId ? {
    name: { $regex: query, $options: 'i' },
    is_active: true,
    $or: [{ created_by: userId }, { admin_user_id: userId }, { verification_status: 'approved' }]
  } : {
    name: { $regex: query, $options: 'i' },
    is_active: true,
    verification_status: 'approved'
  };

  const brands = await brandRepo.searchPublicBrands(searchQuery, 20);
  return await enrichBrandsWithPending(brands);
};
