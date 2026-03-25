import mongoose from 'mongoose';
import * as categoryRepo from '../../repositories/categoryRepository.js';
import * as foodItemRepo from '../../repositories/foodItemRepository.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';
import type { ICategory } from '../../models/Category.js';

export const generateUniqueCategorySlug = async (outletId: string, name: string, excludeId?: string) => {
    const baseSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    let slug = baseSlug;
    let counter = 1;
    while (await categoryRepo.findByOutletAndSlug(outletId, slug, excludeId)) {
        slug = `${baseSlug}-${counter}`;
        counter++;
    }
    return slug;
};

export const applyCategoryImageFromSlugMap = async (categoryDocId: string, categoryName: string): Promise<void> => {
    try {
        const slug = categoryName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        const mapEntry = await categoryRepo.findAndUpsertSlugMap(slug);
        if (mapEntry?.itemKey) {
            const image = await categoryRepo.findCategoryImageById(String(mapEntry.itemKey));
            if (image?.image_url) {
                await categoryRepo.updateById(categoryDocId, { image_url: image.image_url });
            }
        }
    } catch (err) {
        console.error('[applyCategoryImageFromSlugMap] non-blocking error:', err);
    }
};

export const createCategory = async (outletId: string, categoryData: { name: string; isActive?: boolean; sortOrder?: number; [key: string]: unknown }, session?: mongoose.ClientSession) => {
    const slug = await generateUniqueCategorySlug(outletId, categoryData.name);
    const category = await categoryRepo.create({
        ...categoryData,
        outlet_id: outletId,
        slug,
        is_active: categoryData.isActive ?? true,
        display_order: categoryData.sortOrder
    }, session);
    
    // Best-effort image application
    void applyCategoryImageFromSlugMap(String(category._id), category.name);
    
    return category;
};

export const listCategories = async (outletId: string) => {
    const categories = await categoryRepo.findByOutletId(outletId);
    const counts = await categoryRepo.getCategoryItemCounts(outletId);
    
    const countByCategoryId = new Map<string, number>();
    for (const row of counts) {
        if (row?._id) countByCategoryId.set(String(row._id), Number(row.count) || 0);
    }

    return categories.map((c: any) => ({
        id: c._id,
        name: c.name,
        slug: c.slug || '',
        description: c.description,
        imageUrl: c.image_url,
        sortOrder: c.display_order,
        isActive: c.is_active,
        itemCount: countByCategoryId.get(String(c._id)) || 0
    }));
};

export const updateCategory = async (outletId: string, categoryId: string, updateData: { name?: string; imageUrl?: string; isActive?: boolean; sortOrder?: number; [key: string]: unknown }) => {
    const category = await categoryRepo.findByOutletAndId(outletId, categoryId);
    if (!category) throw new AppError('Category not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const updates: Record<string, unknown> = { ...updateData };
    if (updateData.name !== undefined && updateData.name !== category.name) {
        updates.slug = await generateUniqueCategorySlug(outletId, updateData.name, categoryId);
    }
    
    if (updateData.imageUrl !== undefined) updates.image_url = updateData.imageUrl;
    if (updateData.isActive !== undefined) updates.is_active = updateData.isActive;
    if (updateData.sortOrder !== undefined) updates.display_order = updateData.sortOrder;

    return await categoryRepo.updateById(categoryId, updates);
};

export const bulkUpdateCategoryItemType = async (outletId: string, categoryId: string, itemType: 'food' | 'beverage') => {
    const category = await categoryRepo.findByOutletAndId(outletId, categoryId);
    if (!category) throw new AppError('Category not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    return await foodItemRepo.updateMany(
        { category_id: categoryId, outlet_id: outletId },
        { $set: { item_type: itemType } }
    );
};

export const deleteCategory = async (outletId: string, categoryId: string) => {
    const category = await categoryRepo.findByOutletAndId(outletId, categoryId);
    if (!category) throw new AppError('Category not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const itemsCount = await categoryRepo.countItemsInCategory(outletId, categoryId);
    if (itemsCount > 0) {
        throw new AppError('Cannot delete category while it has menu items', 400, ErrorCode.VALIDATION_ERROR);
    }

    return await categoryRepo.deleteById(categoryId);
};
