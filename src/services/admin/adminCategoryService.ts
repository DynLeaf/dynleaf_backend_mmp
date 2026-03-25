import { AppError, ErrorCode } from '../../errors/AppError.js';
import * as categoryRepo from '../../repositories/admin/adminCategoryRepository.js';
import { getS3Service } from '../../services/s3Service.js';

export const getUploadSignature = async (mimeType: string) => {
    const s3Service = getS3Service();
    const maxFileSize = 10 * 1024 * 1024;
    const response = await s3Service.generatePresignedPostUrl('category_image', 'admin', mimeType || 'image/webp', maxFileSize);
    
    return {
        uploadUrl: response.uploadUrl,
        fields: response.fields,
        s3Key: response.s3Key,
        fileUrl: s3Service.getFileUrl(response.s3Key),
        maxFileSize,
        provider: 's3',
    };
};

export const uploadImageViaBackend = async (fileBuffer: string, fileName: string, mimeType?: string) => {
    if (!fileBuffer || !fileName) throw new AppError('fileBuffer and fileName are required', 400);
    const s3Service = getS3Service();
    const buffer = Buffer.from(fileBuffer, 'base64');
    const uploaded = await s3Service.uploadBuffer(buffer, 'category_image', 'admin', fileName, mimeType || 'application/octet-stream');
    
    return {
        s3Key: uploaded.key,
        fileUrl: s3Service.getFileUrl(uploaded.key),
        size: uploaded.size,
        mimeType: uploaded.mimeType,
    };
};

export const listCategoryImages = async () => {
    return await categoryRepo.findCategoryImages();
};

const toSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const createCategoryImage = async (name: string, imageUrl: string) => {
    if (!name?.trim()) throw new AppError('name is required', 400);
    if (!imageUrl?.trim()) throw new AppError('image_url is required', 400);

    const slug = toSlug(name.trim());
    const existing = await categoryRepo.findCategoryImageBySlug(slug);
    if (existing) throw new AppError(`A category image with slug "${slug}" already exists`, 409);

    const image = await categoryRepo.createCategoryImage(name.trim(), slug, imageUrl.trim());
    await categoryRepo.upsertCategorySlugMap(slug, String((image as any)._id));
    await categoryRepo.propagateImageUrlToCategories(slug, imageUrl.trim());

    return image;
};

export const updateCategoryImage = async (id: string, name?: string, imageUrl?: string) => {
    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (imageUrl !== undefined) updates.image_url = imageUrl.trim();

    if (Object.keys(updates).length === 0) throw new AppError('No update fields provided', 400);

    const image = await categoryRepo.updateCategoryImage(id, updates);
    if (!image) throw new AppError('Category image not found', 404);
    return image;
};

export const deleteCategoryImage = async (id: string) => {
    const image = await categoryRepo.deleteCategoryImage(id);
    if (!image) throw new AppError('Category image not found', 404);
    await categoryRepo.nullifySlugMapsByImageId(id);
};

export const listCategorySlugMaps = async (unassigned: boolean) => {
    const query: any = unassigned ? { itemKey: null } : {};
    return await categoryRepo.findCategorySlugMaps(query);
};

export const assignCategorySlugMap = async (slugParam: string, itemKey: string | null) => {
    const slug = slugParam.toLowerCase();
    let imageUrl: string | null = null;

    if (itemKey) {
        const image = await categoryRepo.findCategoryImageById(itemKey);
        if (!image) throw new AppError('CategoryImage not found', 404);
        imageUrl = (image as any).image_url;
    }

    const mapping = await categoryRepo.upsertCategorySlugMap(slug, itemKey ?? null);
    
    if (imageUrl) {
        await categoryRepo.propagateImageUrlToCategories(slug, imageUrl);
    } else {
        await categoryRepo.clearImageUrlFromCategories(slug);
    }

    return mapping;
};

export const listCategoriesWithoutImages = async (page: number, limit: number) => {
    const skip = (page - 1) * limit;
    const { categories, total } = await categoryRepo.findCategoriesWithoutImages(skip, limit);
    return { categories, total, page, limit, totalPages: Math.ceil(total / limit) };
};
