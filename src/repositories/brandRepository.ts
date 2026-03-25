import { Brand, IBrand } from '../models/Brand.js';

export interface BrandSummary {
  _id: string;
  name: string;
  slug: string;
  logo_url?: string;
}

export const findByAdminUserId = async (userId: string): Promise<BrandSummary[]> => {
  const brands = await Brand.find({ admin_user_id: userId })
    .select('_id name slug logo_url')
    .lean();

  return brands.map((b) => ({
    _id: String(b._id),
    name: b.name,
    slug: b.slug,
    logo_url: b.logo_url,
  }));
};

export const findById = async (brandId: string): Promise<any> => {
  return (await Brand.findById(brandId)) as any;
};

export const findByIdLean = async (brandId: string, selectFields?: string): Promise<any> => {
  let query: any = Brand.findById(brandId);
  if (selectFields) query = query.select(selectFields);
  return await query.lean();
};

export const findAdminBrand = async (brandId: string, userId: string): Promise<any> => {
  return (await Brand.findOne({ _id: brandId, admin_user_id: userId })) as any;
};

export const findByNameAndStatus = async (nameRegEx: RegExp, status: string, excludeId?: string): Promise<any> => {
  const query: any = { name: nameRegEx, verification_status: status };
  if (excludeId) query._id = { $ne: excludeId };
  return (await Brand.findOne(query)) as any;
};

export const findAdminBrandByNameAndStatus = async (nameRegEx: RegExp, userId: string, status: string): Promise<any> => {
  return (await Brand.findOne({ name: nameRegEx, admin_user_id: userId, verification_status: status })) as any;
};

export const findBySlug = async (slug: string): Promise<any> => {
  return (await Brand.findOne({ slug })) as any;
};

export const create = async (brandData: any): Promise<any> => {
  return (await Brand.create(brandData)) as any;
};

export const searchPublicBrands = async (query: any, limit: number): Promise<any> => {
  return await Brand.find(query).limit(limit).lean();
};

export const findActiveApprovedBrands = async (skip: number, limit: number): Promise<any> => {
  return await Brand.find({ verification_status: 'approved', is_active: true })
    .select('name slug logo_url description cuisines is_featured')
    .skip(skip)
    .limit(limit)
    .lean();
};

export const countActiveApprovedBrands = async (): Promise<number> => {
  return await Brand.countDocuments({ verification_status: 'approved', is_active: true });
};

export const getFeaturedBrandsAggregate = async (limit: number): Promise<any> => {
  return await Brand.aggregate([
    { $match: { is_featured: true, is_active: true } },
    {
      $lookup: {
        from: 'outlets',
        localField: '_id',
        foreignField: 'brand_id',
        as: 'outlets'
      }
    },
    {
      $addFields: {
        activeOutlets: {
          $filter: {
            input: '$outlets',
            as: 'outlet',
            cond: { $eq: ['$$outlet.is_active', true] }
          }
        }
      }
    },
    { $match: { 'activeOutlets.0': { $exists: true } } },
    {
      $project: {
        name: 1,
        slug: 1,
        logo_url: 1,
        description: 1,
        cuisines: 1,
        social_media: 1,
        is_featured: 1,
        outletCount: { $size: '$activeOutlets' }
      }
    },
    { $limit: limit }
  ]);
};
