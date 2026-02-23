import { Request, Response } from 'express';
import { Outlet } from '../models/Outlet.js';
import OutletQRConfig from '../models/OutletQRConfig.js';
import MallQRConfig from '../models/MallQRConfig.js';

const toSlug = (value?: string) => {
    if (!value) return '';
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
};

const toTitleCase = (value?: string) => {
    if (!value) return '';
    return value
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};

const extractMallName = (addressFull?: string) => {
    if (!addressFull) return null;

    const normalized = addressFull.replace(/\s+/g, ' ').trim();
    const segmentPatterns = [
        /([^,]*\b(?:mall|food\s*court)\b[^,]*)/i,
        /([^|]*\b(?:mall|food\s*court)\b[^|]*)/i,
        /(\b(?:mall|food\s*court)\b.*)$/i
    ];

    for (const pattern of segmentPatterns) {
        const match = normalized.match(pattern);
        const candidate = match?.[1]?.trim();
        if (candidate && candidate.length >= 3) {
            return toTitleCase(candidate);
        }
    }

    return null;
};

const buildMallKey = (mallName: string, city?: string, state?: string) => {
    const mallSlug = toSlug(mallName);
    const citySlug = toSlug(city) || 'unknown-city';
    const stateSlug = toSlug(state) || 'unknown-state';
    return `${mallSlug}-${citySlug}-${stateSlug}`;
};

/**
 * Get all approved outlets for QR management
 * GET /api/v1/admin/qr/outlets
 */
export const getApprovedOutlets = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 50, search = '' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        // Build query for approved outlets
        const query: any = {
            approval_status: 'APPROVED'
        };

        // Add search if provided
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { slug: { $regex: search, $options: 'i' } }
            ];
        }

        // Get outlets with QR config info
        const outlets = await Outlet.find(query)
            .populate('brand_id', 'name')
            .select('name slug address brand_id status approval_status')
            .skip(skip)
            .limit(Number(limit))
            .sort({ created_at: -1 })
            .lean();

        // Get QR configs for these outlets
        const outletIds = outlets.map((o: any) => o._id);
        const qrConfigs = await OutletQRConfig.find({
            outlet_id: { $in: outletIds }
        }).lean();

        // Map QR configs to outlets
        const qrConfigMap = new Map(
            qrConfigs.map((config: any) => [config.outlet_id.toString(), config])
        );

        // Enrich outlets with QR config data
        const enrichedOutlets = outlets.map((outlet: any) => ({
            ...outlet,
            qr_config: qrConfigMap.get(outlet._id.toString()) || null
        }));

        const total = await Outlet.countDocuments(query);

        res.json({
            success: true,
            data: {
                outlets: enrichedOutlets,
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching approved outlets for QR:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch approved outlets'
        });
    }
};

/**
 * Get QR configuration for a specific outlet
 * GET /api/v1/admin/qr/outlets/:outletId/config
 */
export const getOutletQRConfig = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;

        // Verify outlet exists and is approved
        const outlet = await Outlet.findOne({
            _id: outletId,
            approval_status: 'APPROVED'
        })
            .populate('brand_id', 'name')
            .select('name slug brand_id')
            .lean();

        if (!outlet) {
            return res.status(404).json({
                success: false,
                message: 'Outlet not found or not approved'
            });
        }

        // Get QR config
        const qrConfig = await OutletQRConfig.findOne({
            outlet_id: outletId
        }).lean();

        res.json({
            success: true,
            data: {
                outlet,
                qr_config: qrConfig || null
            }
        });
    } catch (error) {
        console.error('Error fetching outlet QR config:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch QR configuration'
        });
    }
};

/**
 * Update QR configuration for an outlet (set table count)
 * POST /api/v1/admin/qr/outlets/:outletId/generate
 */
export const updateOutletQRConfig = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { table_count } = req.body;

        // Validate table count
        if (!table_count || table_count < 1 || table_count > 1000) {
            return res.status(400).json({
                success: false,
                message: 'Table count must be between 1 and 1000'
            });
        }

        // Verify outlet exists and is approved
        const outlet = await Outlet.findOne({
            _id: outletId,
            approval_status: 'APPROVED'
        });

        if (!outlet) {
            return res.status(404).json({
                success: false,
                message: 'Outlet not found or not approved'
            });
        }

        // Update or create QR config
        const qrConfig = await OutletQRConfig.findOneAndUpdate(
            { outlet_id: outletId },
            {
                outlet_id: outletId,
                table_count: Number(table_count),
                last_generated_at: new Date()
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        );

        res.json({
            success: true,
            data: {
                qr_config: qrConfig,
                message: `QR configuration updated for ${table_count} tables`
            }
        });
    } catch (error) {
        console.error('Error updating outlet QR config:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update QR configuration'
        });
    }
};

/**
 * Get all derived malls for QR management
 * GET /api/v1/admin/qr/malls
 */
export const getDerivedMalls = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 50, search = '' } = req.query;
        const pageNum = Number(page);
        const limitNum = Number(limit);

        const outlets = await Outlet.find({
            approval_status: 'APPROVED',
            status: 'ACTIVE'
        })
            .populate('brand_id', 'name verification_status is_active')
            .select('name slug address media brand_id')
            .lean();

        const mallMap = new Map<string, any>();

        for (const outlet of outlets as any[]) {
            const brand = outlet.brand_id;
            if (!brand || brand.verification_status !== 'approved' || !brand.is_active) continue;

            const mallName = extractMallName(outlet.address?.full);
            if (!mallName) continue;

            const mallKey = buildMallKey(mallName, outlet.address?.city, outlet.address?.state);

            if (!mallMap.has(mallKey)) {
                mallMap.set(mallKey, {
                    key: mallKey,
                    name: mallName,
                    city: outlet.address?.city || null,
                    state: outlet.address?.state || null,
                    outlet_count: 0
                });
            }

            mallMap.get(mallKey).outlet_count += 1;
        }

        let malls = Array.from(mallMap.values());

        if (search) {
            const searchValue = String(search).toLowerCase();
            malls = malls.filter((mall) =>
                mall.name.toLowerCase().includes(searchValue) ||
                (mall.city || '').toLowerCase().includes(searchValue) ||
                (mall.state || '').toLowerCase().includes(searchValue)
            );
        }

        const mallKeys = malls.map((m) => m.key);
        const configs = await MallQRConfig.find({ mall_key: { $in: mallKeys } }).lean();
        const configMap = new Map(configs.map((config: any) => [config.mall_key, config]));

        const enrichedMalls = malls
            .map((mall) => ({
                ...mall,
                qr_config: configMap.get(mall.key) || null
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const total = enrichedMalls.length;
        const start = (pageNum - 1) * limitNum;
        const paginated = enrichedMalls.slice(start, start + limitNum);

        res.json({
            success: true,
            data: {
                malls: paginated,
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('Error fetching derived malls for QR:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch malls'
        });
    }
};

/**
 * Get QR configuration for a specific mall
 * GET /api/v1/admin/qr/malls/:mallKey/config
 */
export const getMallQRConfig = async (req: Request, res: Response) => {
    try {
        const { mallKey } = req.params;

        const outlets = await Outlet.find({
            approval_status: 'APPROVED',
            status: 'ACTIVE'
        })
            .populate('brand_id', 'name verification_status is_active')
            .select('name slug address brand_id')
            .lean();

        const mallOutlets = (outlets as any[])
            .filter((outlet) => {
                const brand = outlet.brand_id;
                if (!brand || brand.verification_status !== 'approved' || !brand.is_active) return false;
                const mallName = extractMallName(outlet.address?.full);
                if (!mallName) return false;
                const key = buildMallKey(mallName, outlet.address?.city, outlet.address?.state);
                return key === mallKey;
            })
            .map((outlet) => ({
                _id: outlet._id,
                name: outlet.name,
                slug: outlet.slug,
                brand_name: outlet.brand_id?.name
            }));

        if (mallOutlets.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Mall not found'
            });
        }

        const sampleOutlet = (outlets as any[]).find((outlet) => {
            const mallName = extractMallName(outlet.address?.full);
            if (!mallName) return false;
            const key = buildMallKey(mallName, outlet.address?.city, outlet.address?.state);
            return key === mallKey;
        }) as any;

        const mallName = extractMallName(sampleOutlet?.address?.full) || 'Mall Food Court';
        const config = await MallQRConfig.findOne({ mall_key: mallKey }).lean();

        return res.json({
            success: true,
            data: {
                mall: {
                    key: mallKey,
                    name: mallName,
                    city: sampleOutlet?.address?.city || null,
                    state: sampleOutlet?.address?.state || null,
                    outlet_count: mallOutlets.length,
                    outlets: mallOutlets
                },
                qr_config: config || null
            }
        });
    } catch (error) {
        console.error('Error fetching mall QR config:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch mall QR configuration'
        });
    }
};

/**
 * Update QR configuration for a mall
 * POST /api/v1/admin/qr/malls/:mallKey/generate
 */
import { getS3Service } from '../services/s3Service.js';

export const uploadMallImageViaBackend = async (req: Request, res: Response) => {
    try {
        const s3Service = getS3Service();
        const userId = (req as any).user?.id || 'admin';
        const { fileBuffer, fileName, mimeType } = req.body || {};

        if (!fileBuffer || !fileName) {
            return res.status(400).json({
                success: false,
                message: 'fileBuffer and fileName are required'
            });
        }

        const buffer = Buffer.from(fileBuffer, 'base64');

        const uploadedFile = await s3Service.uploadBuffer(
            buffer,
            'mall_image',
            userId,
            fileName,
            mimeType || 'application/octet-stream'
        );

        return res.json({
            success: true,
            data: {
                s3Key: uploadedFile.key,
                fileUrl: s3Service.getFileUrl(uploadedFile.key),
                size: uploadedFile.size,
                mimeType: uploadedFile.mimeType,
            }
        });
    } catch (error: any) {
        console.error('Upload mall image via backend error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to upload mall image'
        });
    }
};

export const updateMallQRConfig = async (req: Request, res: Response) => {
    try {
        const { mallKey } = req.params;
        const { qr_url, image } = req.body;

        if (!qr_url || typeof qr_url !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'qr_url is required'
            });
        }

        const mallResponse = await getMallMetaByKey(mallKey);

        if (!mallResponse) {
            return res.status(404).json({
                success: false,
                message: 'Mall not found'
            });
        }

        const updateData: any = {
            mall_key: mallKey,
            mall_name: mallResponse.mallName,
            city: mallResponse.city,
            state: mallResponse.state,
            qr_url,
            last_generated_at: new Date()
        };

        if (image !== undefined) {
            updateData.image = image;
        }

        const config = await MallQRConfig.findOneAndUpdate(
            { mall_key: mallKey },
            updateData,
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        );

        res.json({
            success: true,
            data: {
                qr_config: config,
                message: 'Mall QR configuration updated'
            }
        });
    } catch (error) {
        console.error('Error updating mall QR config:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update mall QR configuration'
        });
    }
};

const getMallMetaByKey = async (mallKey: string): Promise<{ mallName: string; city?: string; state?: string } | null> => {
    const outlets = await Outlet.find({
        approval_status: 'APPROVED',
        status: 'ACTIVE'
    })
        .populate('brand_id', 'verification_status is_active')
        .select('address brand_id')
        .lean();

    for (const outlet of outlets as any[]) {
        const brand = outlet.brand_id;
        if (!brand || brand.verification_status !== 'approved' || !brand.is_active) continue;
        const mallName = extractMallName(outlet.address?.full);
        if (!mallName) continue;
        const key = buildMallKey(mallName, outlet.address?.city, outlet.address?.state);
        if (key === mallKey) {
            return {
                mallName,
                city: outlet.address?.city,
                state: outlet.address?.state
            };
        }
    }

    return null;
};
