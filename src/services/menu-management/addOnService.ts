import * as addOnRepo from '../../repositories/addOnRepository.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';

export const listAddOns = async (outletId: string) => {
  return await addOnRepo.findByOutletId(outletId);
};

export const createAddOn = async (outletId: string, addOnData: Record<string, unknown>, session?: unknown) => {
  return await addOnRepo.create({
    ...addOnData,
    outlet_id: outletId,
    display_order: (addOnData.sortOrder as number),
    is_active: (addOnData.isActive as boolean) ?? true
  }, session);
};

export const updateAddOn = async (outletId: string, addOnId: string, updateData: Record<string, unknown>) => {
  const addOn = await addOnRepo.findByOutletAndId(outletId, addOnId);
  if (!addOn) throw new AppError('Add-on not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

  const updates: Record<string, unknown> = { ...updateData };
  if (updateData.sortOrder !== undefined) updates.display_order = updateData.sortOrder;
  if (updateData.isActive !== undefined) updates.is_active = updateData.isActive;

  return await addOnRepo.updateById(addOnId, updates);
};

export const deleteAddOn = async (outletId: string, addOnId: string) => {
  const addOn = await addOnRepo.findByOutletAndId(outletId, addOnId);
  if (!addOn) throw new AppError('Add-on not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

  return await addOnRepo.deleteById(addOnId);
};
