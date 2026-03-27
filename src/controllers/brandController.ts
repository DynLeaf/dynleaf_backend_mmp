import { Response } from 'express';
import { AuthRequest } from '../types/express.js';
import * as brandService from '../services/brandService.js';
import * as brandDiscoveryService from '../services/brand/brandDiscoveryService.js';
import { getS3Service } from '../services/s3Service.js';
import { sendSuccess, sendError, sendAuthError } from '../utils/response.js';
import { AppError } from '../errors/AppError.js';
import mongoose from 'mongoose';
import { sendBrandOnboardingEmail } from '../services/emailService.js';
import { createAdminNotification } from '../services/adminNotificationService.js';
import * as userRepository from '../repositories/userRepository.js';
import { IBrand } from '../models/Brand.js';
import { BrandMapper } from '../mappers/brandMapper.js';
import { CreateBrandRequestDto, UpdateBrandRequestDto, UpdateBrandThemeRequestDto } from '../dto/brand/brand.dto.js';

const handleLogoUpload = async (logo: string | undefined, name: string): Promise<string | undefined> => {
  if (!logo) return undefined;
  if (logo.startsWith('data:')) {
    const s3Service = getS3Service();
    const matches = logo.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) throw new Error('Invalid base64 string');
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const uploadedFile = await s3Service.uploadBuffer(buffer, 'brand_logo', name, `logo-${Date.now()}`, mimeType);
    return uploadedFile.key;
  }
  return logo;
};

const mapOperationModel = (model?: string) => ({
  corporate: model === 'corporate' || model === 'hybrid',
  franchise: model === 'franchise' || model === 'hybrid'
});

const handleError = (res: Response, error: unknown): Response => {
  if (error instanceof AppError) {
    if (error.statusCode === 401) return sendAuthError(res, error.errorCode, error.message);
    return sendError(res, error.message, error.errorCode, error.statusCode);
  }
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  return sendError(res, message, 'INTERNAL_ERROR', 500);
};

export const createBrand = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const { name, logo, description, operationModel, cuisines, website, instagram }: CreateBrandRequestDto = req.body;

    const logoUrl = await handleLogoUpload(logo, name);
    const operatingModes = mapOperationModel(operationModel);

    const brand = await brandService.createBrand(req.user.id, {
      name, description, logo_url: logoUrl, cuisines: cuisines || [], operating_modes: operatingModes, social_media: { website, instagram }
    });

    const email = req.user.phone || 'Unknown';
    sendBrandOnboardingEmail(brand.name, new Date(), email);
    createAdminNotification({ title: 'New Brand', message: `"${brand.name}" pending approval.`, type: 'brand', referenceId: String(brand._id) });

    return sendSuccess(res, BrandMapper.toResponseDto(brand), 'Brand created successfully', 201);
  } catch (error) { return handleError(res, error); }
};

export const getUserBrands = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const brands = await brandService.getUserBrands(req.user.id);
    return sendSuccess(res, { brands: brands.map(BrandMapper.toResponseDto) });
  } catch (error) { return handleError(res, error); }
};

export const searchBrands = async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) {
      const brands = await brandService.getPublicBrands(req.user?.id);
      return sendSuccess(res, { brands: brands.map(BrandMapper.toResponseDto) });
    }
    const brands = await brandService.searchBrands(q as string, req.user?.id);
    return sendSuccess(res, { brands: brands.map(BrandMapper.toResponseDto) });
  } catch (error) { return handleError(res, error); }
};

export const updateBrand = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const { brandId } = req.params;
    const { name, logo, description, cuisines, website, instagram, operationModel }: UpdateBrandRequestDto = req.body;

    const logoUrl = await handleLogoUpload(logo, name || 'brand');
    const operatingModes = operationModel ? mapOperationModel(operationModel) : undefined;
    
    // For simplicity, passing logo updates directly into the service layer
    const updateData: Record<string, any> = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (logoUrl !== undefined) updateData.logo_url = logoUrl;
    if (cuisines) updateData.cuisines = cuisines;
    if (website !== undefined || instagram !== undefined) updateData.social_media = { website, instagram };
    if (operatingModes) updateData.operating_modes = operatingModes;

    const brand = await brandService.updateBrand(brandId, req.user.id, updateData);
    return sendSuccess(res, BrandMapper.toResponseDto(brand), 'Brand updated successfully');
  } catch (error) { return handleError(res, error); }
};

export const joinBrand = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const brand = await brandService.getBrandById(req.params.brandId);
    if (!brand) return sendError(res, 'Brand not found', 'RESOURCE_NOT_FOUND', 404);

    await userRepository.addBrandManagerRole(req.user.id, brand._id);
    return sendSuccess(res, BrandMapper.toResponseDto(brand));
  } catch (error) { return handleError(res, error); }
};

export const requestAccess = async (req: AuthRequest, res: Response) => {
  return sendSuccess(res, { requestId: 'mock-id', status: 'PENDING' }, 'Access request created', 201);
};

export const getNearbyBrands = async (req: AuthRequest, res: Response) => {
  try {
    const { latitude, longitude, radius, page, limit, cuisines, priceRange, minRating, sortBy, isVeg } = req.query;
    if (!latitude || !longitude) return sendError(res, 'Latitude and longitude are required', 'VALIDATION_ERROR', 400);

    const result = await brandDiscoveryService.getNearbyBrands(
      latitude as string, longitude as string, radius as string,
      parseInt(page as string) || 1, parseInt(limit as string) || 20,
      cuisines as string, priceRange as string, minRating as string,
      sortBy as 'distance' | 'rating' | 'popularity', isVeg as string
    );

    // Normalize the brands in the result
    if (result.brands) {
      result.brands = result.brands.map(BrandMapper.toResponseDto);
    }

    return sendSuccess(res, result);
  } catch (error) { return handleError(res, error); }
};

export const getFeaturedBrands = async (req: AuthRequest, res: Response) => {
  try {
    const { limit } = req.query;
    const brands = await brandDiscoveryService.getFeaturedBrands(parseInt(limit as string) || 10);
    return sendSuccess(res, { brands: brands.map(BrandMapper.toResponseDto) });
  } catch (error) { return handleError(res, error); }
};

export const getBrandById = async (req: AuthRequest, res: Response) => {
  try {
    const { brandId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(brandId)) return sendError(res, 'Invalid brand ID', 'VALIDATION_ERROR', 400);
    const brand = await brandService.getBrandById(brandId);
    if (!brand) return sendError(res, 'Brand not found', 'RESOURCE_NOT_FOUND', 404);
    
    return sendSuccess(res, BrandMapper.toResponseDto(brand));
  } catch (error) { return handleError(res, error); }
};

export const updateBrandTheme = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return sendAuthError(res, 'INVALID_CREDENTIALS', 'User not authenticated');
    const { primary_color, secondary_color }: UpdateBrandThemeRequestDto = req.body;
    const brand = await brandService.updateBrand(req.params.brandId, req.user.id, { primary_color, secondary_color });
    return sendSuccess(res, BrandMapper.toResponseDto(brand), 'Brand theme updated successfully');
  } catch (error) { return handleError(res, error); }
};
