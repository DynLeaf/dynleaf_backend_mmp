import { Request, Response } from 'express';
import { Brand } from '../models/Brand.js';
import { User } from '../models/User.js';
import { sendSuccess, sendError } from '../utils/response.js';
import * as brandService from '../services/brandService.js';
import { saveBase64Image } from '../utils/fileUpload.js';
import mongoose from 'mongoose';

interface AuthRequest extends Request {
    user?: any;
}

export const createBrand = async (req: AuthRequest, res: Response) => {
    try {
        const { name, logo, description, operationModel, cuisines, website, email } = req.body;

        
        
        // Handle logo upload if base64
        let logoUrl = logo;
        if (logo && logo.startsWith('data:')) {
            const uploadResult = await saveBase64Image(logo, 'brands', name);
            logoUrl = uploadResult.url;
        } else if (logo) {
        }

        // Map operation model to operating_modes
        const operatingModes = {
            corporate: operationModel === 'corporate' || operationModel === 'hybrid',
            franchise: operationModel === 'franchise' || operationModel === 'hybrid'
        };

        const brand = await brandService.createBrand(req.user.id, {
            name,
            description,
            logo_url: logoUrl,
            cuisines: cuisines || [],
            operating_modes: operatingModes,
            social_media: {
                website,
                instagram: req.body.instagram
            }
        });

        return sendSuccess(res, { 
            id: brand._id, 
            name: brand.name,
            logo_url: brand.logo_url,
            slug: brand.slug
        }, 'Brand created successfully', 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getUserBrands = async (req: AuthRequest, res: Response) => {
    try {
        const brands = await brandService.getUserBrands(req.user.id);
        return sendSuccess(res, { brands });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const searchBrands = async (req: AuthRequest, res: Response) => {
    try {
        const { q } = req.query;
        if (!q) {
            const brands = await brandService.getPublicBrands(req.user?.id);
            return sendSuccess(res, { brands });
        }
        const brands = await brandService.searchBrands(q as string, req.user?.id);
        return sendSuccess(res, { brands });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const updateBrand = async (req: AuthRequest, res: Response) => {
    try {
        const { brandId } = req.params;
        const { name, logo, description, cuisines, website, instagram, operationModel } = req.body;

        
        
        // Handle logo upload if base64
        let logoUrl = logo;
        if (logo && logo.startsWith('data:')) {
            const uploadResult = await saveBase64Image(logo, 'brands', name);
            logoUrl = uploadResult.url;
        } else if (logo) {
        }

        const updateData: any = {};
        if (name) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (logoUrl) updateData.logo_url = logoUrl;
        if (cuisines) updateData.cuisines = cuisines;
        if (website || instagram) {
            updateData.social_media = {
                website,
                instagram
            };
        }
        if (operationModel) {
            updateData.operating_modes = {
                corporate: operationModel === 'corporate' || operationModel === 'hybrid',
                franchise: operationModel === 'franchise' || operationModel === 'hybrid'
            };
        }

        const brand = await brandService.updateBrand(brandId, req.user.id, updateData);
        
        if (!brand) {
            return sendError(res, 'Brand not found or unauthorized', null, 404);
        }

        return sendSuccess(res, { 
            id: brand._id, 
            name: brand.name,
            logo_url: brand.logo_url
        }, 'Brand updated successfully');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const joinBrand = async (req: AuthRequest, res: Response) => {
    try {
        const { brandId } = req.params;
        const brand = await Brand.findById(brandId);
        if (!brand) return sendError(res, 'Brand not found', null, 404);

        // Logic to join brand (could be adding to roles)
        await User.findByIdAndUpdate(req.user._id, {
            $push: { roles: { scope: 'brand', role: 'manager', brandId: brand._id } },
            currentStep: 'OUTLET'
        });

        return sendSuccess(res, { id: brand._id, name: brand.name });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const requestAccess = async (req: AuthRequest, res: Response) => {
    return sendSuccess(res, { requestId: 'mock-id', status: 'PENDING' }, 'Access request created', 201);
};
