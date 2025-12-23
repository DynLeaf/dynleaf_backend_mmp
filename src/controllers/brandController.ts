import { Request, Response } from 'express';
import { Brand } from '../models/Brand.js';
import { User } from '../models/User.js';

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

        res.status(201).json({ id: brand._id, name: brand.name });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const searchBrands = async (req: Request, res: Response) => {
    try {
        const { q } = req.query;
        const query = q ? { name: { $regex: q as string, $options: 'i' } } : {};
        const brands = await Brand.find(query).limit(10);
        res.json({ data: brands });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const joinBrand = async (req: AuthRequest, res: Response) => {
    try {
        const { brandId } = req.params;
        const brand = await Brand.findById(brandId);
        if (!brand) return res.status(404).json({ error: 'Brand not found' });

        // Logic to join brand (could be adding to roles)
        await User.findByIdAndUpdate(req.user._id, {
            $push: { roles: { scope: 'brand', role: 'manager', brandId: brand._id } },
            currentStep: 'OUTLET'
        });

        res.json({ id: brand._id, name: brand.name });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const requestAccess = async (req: AuthRequest, res: Response) => {
    res.status(201).json({ requestId: 'mock-id', status: 'PENDING', message: 'Access request created' });
};
