import { Outlet, IOutlet } from '../models/Outlet.js';
import { User } from '../models/User.js';
import { Subscription } from '../models/Subscription.js';
import { OperatingHours } from '../models/OperatingHours.js';
import mongoose from 'mongoose';

export const findByIds = async (ids: string[]): Promise<unknown[]> =>
    Outlet.find({ _id: { $in: ids } }).select('name slug').lean();

export const findFirstActiveApprovedOutletForBrand = async (brandId: string): Promise<unknown> =>
    Outlet.findOne({ brand_id: brandId, status: 'ACTIVE', approval_status: 'APPROVED' })
        .select('name slug address location contact media flags avg_rating total_reviews is_pure_veg')
        .lean();

export const getNearbyOutletsAggregate = (pipeline: mongoose.PipelineStage[]): Promise<unknown[]> =>
    Outlet.aggregate(pipeline);

export const findById = (outletId: string) => Outlet.findById(outletId);

export const findByIdLean = async (id: string) => {
    return await Outlet.findById(id).lean();
};

export const findByIdsLean = async (ids: string[]) => {
    return await Outlet.find({ _id: { $in: ids } }).lean();
};

export const findApprovedOutletsWithBrands = async () => {
    return await Outlet.find({
        approval_status: 'APPROVED',
        status: 'ACTIVE'
    })
    .populate('brand_id', 'name verification_status is_active')
    .select('name slug address brand_id')
    .lean();
};


export const findBySlugOrId = (idOrSlug: string) => {
    const isObjectId = mongoose.Types.ObjectId.isValid(idOrSlug);
    const query = isObjectId ? { _id: idOrSlug } : { slug: idOrSlug };
    return Outlet.findOne({ ...query, status: 'ACTIVE' });
};

export const find = (filter: object) => Outlet.find(filter);

export const findOne = (filter: object) => Outlet.findOne(filter);

export const updateById = (outletId: string, updateData: Partial<IOutlet>) =>
    Outlet.findByIdAndUpdate(outletId, updateData, { new: true });

export const findByBrandId = (brandId: string) =>
    Outlet.find({ brand_id: brandId, status: 'ACTIVE', approval_status: 'APPROVED' })
        .select('name slug address location contact media restaurant_type vendor_types social_media avg_rating total_reviews')
        .lean();

export const findOutletIdsByBrand = async (brandId: string): Promise<mongoose.Types.ObjectId[]> => {
    const outlets = await Outlet.find({ brand_id: brandId }).select('_id');
    return outlets.map(o => o._id as mongoose.Types.ObjectId);
};

export const create = (outletData: Partial<IOutlet>) => Outlet.create(outletData);

// ─── New functions for outletService ────────────────────────────────────────

export const findUserRoles = (userId: string) =>
    User.findById(userId).select('roles').lean();

export const findSubscriptionByOutletId = (outletId: mongoose.Types.ObjectId | string) =>
    Subscription.findOne({ outlet_id: outletId as string }).select('plan status').lean();

export const findAndUpdateOutlet = async (
    filter: object,
    updateData: Partial<IOutlet>
): Promise<IOutlet | null> => {
    const outlet = await Outlet.findOne(filter);
    if (!outlet) return null;
    Object.assign(outlet, updateData);
    await (outlet as unknown as { save(): Promise<void> }).save();
    return outlet;
};

export const findByIdWithPopulate = (idOrSlug: string) => {
    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
        return Outlet.findById(idOrSlug).populate('brand_id');
    }
    return Outlet.findOne({ slug: idOrSlug }).populate('brand_id');
};

export const findByBrandIdAll = (brandId: string) =>
    Outlet.find({ brand_id: brandId, status: { $ne: 'ARCHIVED' } });

export const findWithQuery = (query: object) =>
    Outlet.find(query).populate('brand_id').sort({ created_at: -1 });

export const findWithQuerySelect = (query: object) =>
    Outlet.find(query)
        .select('_id name slug brand_id status approval_status media.cover_image_url address.city')
        .populate('brand_id', 'name')
        .sort({ created_at: -1 })
        .lean();

export const findUserByIdForRole = (userId: string) => User.findById(userId);

export const findOperatingHours = (outletId: mongoose.Types.ObjectId | string) =>
    OperatingHours.find({ outlet_id: outletId as string }).lean();

// ─── Paged / bulk queries for QR service ────────────────────────────────────

export const findPaged = (query: object, skip: number, limit: number) =>
    Outlet.find(query)
        .populate('brand_id', 'name')
        .select('name slug address brand_id status approval_status')
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 })
        .lean();

export const countWithQuery = (query: object): Promise<number> => Outlet.countDocuments(query);

export const findActiveApproved = () =>
    Outlet.find({ approval_status: 'APPROVED', status: 'ACTIVE' })
        .populate('brand_id', 'name verification_status is_active')
        .select('name slug address media brand_id')
        .lean();

export const findActiveApprovedSelectAddress = () =>
    Outlet.find({ approval_status: 'APPROVED', status: 'ACTIVE' })
        .populate('brand_id', 'verification_status is_active')
        .select('address brand_id')
        .lean();

export const findSubscriptionByOutletIdStr = (outletId: string) =>
    Subscription.findOne({ outlet_id: outletId }).lean();

export const findOutletSubMenusActive = async (outletId: string) => {
    const { OutletSubMenu } = await import('../models/OutletSubMenu.js');
    return OutletSubMenu.find({ outlet_id: outletId, is_active: true }).sort({ display_order: 1 }).lean();
};
