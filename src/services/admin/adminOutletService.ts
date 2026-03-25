import { AppError } from '../../errors/AppError.js';
import * as outletRepo from '../../repositories/admin/adminOutletRepository.js';
import * as userRepo from '../../repositories/admin/adminUserRepository.js';

export const listOutlets = async (page: number, limit: number, queryParams: any) => {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (queryParams.search) query.name = { $regex: queryParams.search, $options: 'i' };
    if (queryParams.status && queryParams.status !== 'all') query.status = queryParams.status;
    if (queryParams.approval_status && queryParams.approval_status !== 'all') query.approval_status = queryParams.approval_status;
    if (queryParams.operating_mode && queryParams.operating_mode !== 'all') query.operating_mode = queryParams.operating_mode;

    const { outlets, total } = await outletRepo.findOutlets(query, skip, limit);
    return { outlets, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getOutletDetail = async (id: string) => {
    const outlet = await outletRepo.findOutletDetailsById(id);
    if (!outlet) throw new AppError('Outlet not found', 404);

    const compliance = await outletRepo.findComplianceByOutletId(id);
    const menus = await outletRepo.findMenusWithCountsByOutletId(id);

    return { ...outlet, compliance, menus, activities: [] };
};

export const updateOutletStatus = async (id: string, status: string) => {
    if (!status) throw new AppError('Status is required', 400);
    const validStatuses = ['DRAFT', 'ACTIVE', 'INACTIVE', 'REJECTED', 'ARCHIVED'];
    if (!validStatuses.includes(status)) throw new AppError('Invalid status', 400);

    const outlet = await outletRepo.updateOutletStatus(id, status);
    if (!outlet) throw new AppError('Outlet not found', 404);
    return outlet;
};

export const changeOutletOwner = async (id: string, newOwnerId: string, adminId: string) => {
    if (!newOwnerId) throw new AppError('User ID is required', 400);

    const newOwner = await userRepo.findUserById(newOwnerId);
    if (!newOwner) throw new AppError('User not found', 404);

    const outlet = await outletRepo.findOutletDetailsById(id);
    if (!outlet) throw new AppError('Outlet not found', 404);

    const previousOwnerId = String((outlet.created_by_user_id as any)?._id || outlet.created_by_user_id);
    const updated = await outletRepo.updateOutletOwner(id, newOwnerId, previousOwnerId, adminId);
    return updated;
};

export const toggleComplianceVerification = async (id: string, adminId: string) => {
    const compliance = await outletRepo.findComplianceById(id);
    if (!compliance) throw new AppError('Compliance not found', 404);

    return await outletRepo.updateComplianceVerification(id, !compliance.is_verified, adminId);
};

export const updateCompliance = async (id: string, data: any) => {
    const { fssai_number, gst_number, gst_percentage } = data;
    const compliance = await outletRepo.findComplianceById(id);
    if (!compliance) throw new AppError('Compliance not found', 404);

    if (fssai_number && !/^\d{14}$/.test(fssai_number)) throw new AppError('FSSAI number must be exactly 14 digits', 400);
    if (gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gst_number)) throw new AppError('Invalid GST number format', 400);
    if (gst_percentage !== undefined && gst_percentage !== null && gst_percentage !== '') {
        const gstPercent = parseFloat(gst_percentage);
        if (isNaN(gstPercent) || gstPercent < 0 || gstPercent > 100) throw new AppError('GST percentage must be between 0 and 100', 400);
    }

    const updateData: any = {};
    if (fssai_number !== undefined) updateData.fssai_number = fssai_number || undefined;
    if (gst_number !== undefined) updateData.gst_number = gst_number || undefined;
    if (gst_percentage !== undefined) updateData.gst_percentage = gst_percentage === '' ? undefined : parseFloat(gst_percentage);

    return await outletRepo.updateComplianceData(id, updateData);
};
