import { Brand } from '../../models/Brand.js';
import { BrandMember } from '../../models/BrandMember.js';
import { Outlet } from '../../models/Outlet.js';

export const findBrandById = (brandId: string) => Brand.findById(brandId);

export const findMembership = (brandId: string, userId: string) =>
    BrandMember.findOne({ brand_id: brandId, user_id: userId });

export const findAllMembers = (brandId: string) =>
    BrandMember.find({ brand_id: brandId })
        .populate('user_id', 'name email phone')
        .sort({ created_at: -1 });

export const createMember = (data: {
    brand_id: string;
    user_id: string;
    role: string;
    permissions: object;
    assigned_outlets?: string[];
}) => BrandMember.create(data as any);

export const updateMember = (brandId: string, userId: string, updates: object) =>
    BrandMember.findOneAndUpdate({ brand_id: brandId, user_id: userId }, updates, { new: true });

export const deleteMember = (brandId: string, userId: string) =>
    BrandMember.findOneAndDelete({ brand_id: brandId, user_id: userId });

export const findUserOutletsForBrand = (brandId: string, userId: string) =>
    Outlet.find({
        brand_id: brandId,
        $or: [{ created_by_user_id: userId }, { 'managers.user_id': userId }]
    });

export const findApprovedOutlets = (brandId: string) =>
    Outlet.find({ brand_id: brandId, approval_status: 'APPROVED' })
        .populate('brand_id', 'name')
        .select('_id name address location created_by_user_id brand_id media approval_status');

export const findUserApprovedOutlets = (brandId: string, userId: string) =>
    Outlet.find({
        brand_id: brandId,
        approval_status: 'APPROVED',
        $or: [{ created_by_user_id: userId }, { 'managers.user_id': userId }]
    })
        .populate('brand_id', 'name')
        .select('_id name address location created_by_user_id brand_id media approval_status');

export const enableCrossUserSync = (brandId: string) =>
    Brand.findByIdAndUpdate(brandId, { $set: { 'settings.allow_cross_user_sync': true } });

export const updateBrandSettings = (brandId: string, updates: object) =>
    Brand.findByIdAndUpdate(brandId, { $set: updates }, { new: true });
