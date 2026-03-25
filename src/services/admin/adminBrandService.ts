import { AppError, ErrorCode } from '../../errors/AppError.js';
import * as brandRepo from '../../repositories/admin/adminBrandRepository.js';

export const listBrands = async (page: number, limit: number, queryParams: any) => {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (queryParams.search) query.name = { $regex: queryParams.search, $options: 'i' };
    if (queryParams.verification_status && queryParams.verification_status !== 'all') {
        query.verification_status = queryParams.verification_status;
    }
    if (queryParams.operating_mode && queryParams.operating_mode !== 'all') {
        const mode = queryParams.operating_mode;
        if (mode === 'corporate') {
            query['operating_modes.corporate'] = true;
            query['operating_modes.franchise'] = false;
        } else if (mode === 'franchise') {
            query['operating_modes.corporate'] = false;
            query['operating_modes.franchise'] = true;
        } else if (mode === 'hybrid') {
            query['operating_modes.corporate'] = true;
            query['operating_modes.franchise'] = true;
        } else if (mode === 'open') {
            query['operating_modes.corporate'] = false;
            query['operating_modes.franchise'] = false;
        }
    }
    if (queryParams.is_featured && queryParams.is_featured !== 'all') {
        query.is_featured = queryParams.is_featured === 'true';
    }

    const { brands, total } = await brandRepo.findBrands(query, skip, limit);
    return { brands, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getBrandDetail = async (id: string) => {
    const brand = await brandRepo.findBrandById(id);
    if (!brand) throw new AppError('Brand not found', 404);

    const outlets = await brandRepo.findOutletsByBrand(id);
    const menus = await brandRepo.findMenusByBrand(id);

    const totalItems = menus.reduce((sum: number, menu: any) => {
        return sum + menu.categories.reduce((catSum: number, cat: any) => catSum + (cat.items?.length || 0), 0);
    }, 0);

    const brandData = {
        ...brand,
        created_by: (brand as any).created_by || brand.admin_user_id,
    };

    return {
        brand: brandData,
        outlets,
        outletsCount: outlets.length,
        menus: menus.map((menu: any) => ({
            _id: menu._id,
            name: menu.name,
            slug: menu.slug,
            is_active: menu.is_active,
            is_default: menu.is_default,
            categoriesCount: menu.categories?.length || 0,
            itemsCount: menu.categories?.reduce((sum: number, cat: any) => sum + (cat.items?.length || 0), 0) || 0
        })),
        menusCount: menus.length,
        totalMenuItems: totalItems
    };
};

export const changeBrandOwner = async (brandId: string, newOwnerId: string, reviewerId: string) => {
    if (!newOwnerId) throw new AppError('User ID is required', 400);

    const userExists = await brandRepo.checkUserExists(newOwnerId);
    if (!userExists) throw new AppError('User not found', 404);

    const brand = await brandRepo.findBrandById(brandId);
    if (!brand) throw new AppError('Brand not found', 404);

    const previousOwnerId = brand.admin_user_id ? String((brand.admin_user_id as any)._id || brand.admin_user_id) : undefined;
    const updated = await brandRepo.updateBrandOwner(brandId, newOwnerId, previousOwnerId, reviewerId);
    return updated;
};

export const approveBrand = async (brandId: string) => {
    const brand = await brandRepo.updateBrandVerificationStatus(brandId, 'approved');
    if (!brand) throw new AppError('Brand not found', 404);
    return brand;
};

export const rejectBrand = async (brandId: string, reason: string) => {
    if (!reason?.trim()) throw new AppError('Rejection reason is required', 400);
    const brand = await brandRepo.updateBrandVerificationStatus(brandId, 'rejected', reason);
    if (!brand) throw new AppError('Brand not found', 404);
    return brand;
};

export const listBrandUpdates = async (page: number, limit: number, statusFilter?: string) => {
    const skip = (page - 1) * limit;
    const query: any = {};
    if (statusFilter && statusFilter !== 'all') {
        query.status = statusFilter;
    }

    const { requests, total } = await brandRepo.findBrandUpdateRequests(query, skip, limit);
    return { requests, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getBrandUpdateDetail = async (id: string) => {
    const request = await brandRepo.findBrandUpdateRequestById(id);
    if (!request) throw new AppError('Update request not found', 404);
    return { request };
};

export const approveBrandUpdate = async (id: string) => {
    const request = await brandRepo.findBrandUpdateRequestById(id);
    if (!request) throw new AppError('Update request not found', 404);

    const parsedUpdates = typeof (request as any).updates === 'string' ? JSON.parse((request as any).updates) : (request as any).updates;
    const updated = await brandRepo.processBrandUpdateRequest(id, 'approved', parsedUpdates);
    return updated;
};

export const rejectBrandUpdate = async (id: string, reason: string) => {
    if (!reason?.trim()) throw new AppError('Rejection reason is required', 400);
    const updated = await brandRepo.processBrandUpdateRequest(id, 'rejected', undefined, reason);
    if (!updated) throw new AppError('Update request not found', 404);
    return updated;
};
