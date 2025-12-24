import { Request, Response } from 'express';
import { Brand } from '../models/Brand.js';
import { User } from '../models/User.js';
import { sendSuccess, sendError } from '../utils/response.js';

import mongoose from 'mongoose';

interface AuthRequest extends Request {
    user?: any;
}

export const createBrand = async (req: AuthRequest, res: Response) => {
    try {
        const { name, logoUrl, description, operationModel, cuisines, website, email } = req.body;

        const brand = await Brand.create({
            name,
            logo_url: logoUrl,
            description,
            operating_modes: operationModel,
            cuisines,
            social_media: { website },
            admin_user_id: req.user._id
        } as any) as any;

        // Update user state
        await User.findByIdAndUpdate(req.user._id, { currentStep: 'OUTLET' });

        return sendSuccess(res, { id: brand._id, name: brand.name }, null, 201);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const searchBrands = async (req: Request, res: Response) => {
    try {
        const { q } = req.query;
        const query = q ? { name: { $regex: q as string, $options: 'i' } } : {};
        const brands = await Brand.find(query).limit(10);
        return sendSuccess(res, brands);
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
