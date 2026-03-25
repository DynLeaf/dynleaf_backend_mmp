import { Request, Response } from 'express';
import { qrConfigService } from '../../services/qr/qrConfigService.js';
import { qrGenerationService } from '../../services/qr/qrGenerationService.js';
import { mallQRRepository } from '../../repositories/qr/mallQRRepository.js';
import * as outletRepo from '../../repositories/outletRepository.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { 
    extractGroupKeyFromMallKey, 
    normalizeMallName, 
    extractMallName, 
    buildMallKey, 
    getMallGroupKey 
} from '../../utils/mallKeyUtils.js';

export const getDerivedMalls = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 50, search = '' } = req.query;
        const result = await qrConfigService.getDerivedMalls(Number(page), Number(limit), String(search));
        return sendSuccess(res, result);
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const getMallQRConfig = async (req: Request, res: Response) => {
    try {
        const { mallKey } = req.params;
        const groupKey = extractGroupKeyFromMallKey(mallKey);
        const outlets = await outletRepo.findApprovedOutletsWithBrands();

        const matchedMallKeys = new Set<string>([mallKey]);
        const mallOutlets = (outlets as any[])
            .filter((outlet) => {
                const brand = outlet.brand_id;
                if (!brand || brand.verification_status !== 'approved' || !brand.is_active) return false;
                const mallName = normalizeMallName(extractMallName(outlet.address?.full) || '');
                if (!mallName) return false;
                const key = buildMallKey(mallName, outlet.address?.city, outlet.address?.state);
                const gkey = getMallGroupKey(mallName);
                if (key === mallKey || gkey === groupKey) {
                    matchedMallKeys.add(key);
                    return true;
                }
                return false;
            })
            .map((outlet) => ({
                _id: outlet._id,
                name: outlet.name,
                slug: outlet.slug,
                brand_name: outlet.brand_id?.name
            }));

        if (mallOutlets.length === 0) return sendError(res, 'Mall not found', 404);

        const config = await mallQRRepository.findByMallKey(mallKey);
        const meta = await qrConfigService.getMallMetaByKey(mallKey);

        return sendSuccess(res, {
            mall: {
                key: mallKey,
                name: meta?.mallName || 'Mall Food Court',
                city: meta?.city || null,
                state: meta?.state || null,
                outlet_count: mallOutlets.length,
                outlets: mallOutlets
            },
            qr_config: config || null
        });
    } catch (error: any) {
        return sendError(res, error.message);
    }
};

export const uploadMallImage = async (req: AuthRequest, res: Response) => {
    try {
        const { fileBuffer, fileName, mimeType } = req.body;
        const result = await qrGenerationService.uploadMallImage(req.user?.id || 'admin', fileBuffer, fileName, mimeType);
        return sendSuccess(res, result);
    } catch (error: any) {
        return sendError(res, error.message, error.statusCode || 500);
    }
};

export const updateMallQRConfig = async (req: Request, res: Response) => {
    try {
        const { mallKey } = req.params;
        const { qr_url, image } = req.body;

        const meta = await qrConfigService.getMallMetaByKey(mallKey);
        if (!meta) return sendError(res, 'Mall not found', 404);

        const config = await mallQRRepository.upsertConfig(mallKey, {
            mall_name: meta.mallName,
            city: meta.city,
            state: meta.state,
            qr_url,
            image
        } as any);

        return sendSuccess(res, config, 'Mall QR configuration updated');
    } catch (error: any) {
        return sendError(res, error.message);
    }
};
