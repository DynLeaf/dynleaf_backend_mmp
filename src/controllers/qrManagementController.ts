import { Request, Response } from 'express';
import { Outlet } from '../models/Outlet.js';
import OutletQRConfig from '../models/OutletQRConfig.js';
import MallQRConfig from '../models/MallQRConfig.js';
import {
    buildMallKey,
    extractGroupKeyFromMallKey,
    extractMallName,
    getMallGroupKey,
    normalizeMallName
} from '../utils/mallKeyUtils.js';

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

            const mallName = normalizeMallName(extractMallName(outlet.address?.full) || '');
            if (!mallName) continue;

            const mallKey = buildMallKey(mallName, outlet.address?.city, outlet.address?.state);
            const groupKey = getMallGroupKey(mallName);

            if (!mallMap.has(groupKey)) {
                mallMap.set(groupKey, {
                    key: null,
                    group_key: groupKey,
                    name: mallName,
                    city: outlet.address?.city || null,
                    state: outlet.address?.state || null,
                    outlet_count: 0,
                    key_candidates: new Map([[mallKey, 1]])
                });
            } else {
                const existing = mallMap.get(groupKey);
                existing.key_candidates.set(mallKey, (existing.key_candidates.get(mallKey) || 0) + 1);
            }

            mallMap.get(groupKey).outlet_count += 1;
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

        const mallKeys = malls.flatMap((m: any) => Array.from((m.key_candidates as Map<string, number>).keys()));
        const configs = mallKeys.length
            ? await MallQRConfig.find({ mall_key: { $in: mallKeys } }).lean()
            : [];
        const configMap = new Map(configs.map((config: any) => [config.mall_key, config]));

        const enrichedMalls = malls
            .map((mall: any) => {
                const keyCandidates = Array.from((mall.key_candidates as Map<string, number>).entries())
                    .sort((a, b) => b[1] - a[1]);
                const keyWithConfig = keyCandidates.find(([candidateKey]) => configMap.has(candidateKey))?.[0];
                const selectedKey = keyWithConfig || keyCandidates[0]?.[0] || mall.group_key;

                return {
                    key: selectedKey,
                    name: mall.name,
                    city: mall.city,
                    state: mall.state,
                    outlet_count: mall.outlet_count,
                    qr_config: (keyWithConfig && configMap.get(keyWithConfig)) || configMap.get(selectedKey) || null
                };
            })
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
        const requestedGroupKey = extractGroupKeyFromMallKey(mallKey);

        const outlets = await Outlet.find({
            approval_status: 'APPROVED',
            status: 'ACTIVE'
        })
            .populate('brand_id', 'name verification_status is_active')
            .select('name slug address brand_id')
            .lean();

        const matchedMallKeys = new Set<string>([mallKey]);

        const mallOutlets = (outlets as any[])
            .filter((outlet) => {
                const brand = outlet.brand_id;
                if (!brand || brand.verification_status !== 'approved' || !brand.is_active) return false;
                const mallName = normalizeMallName(extractMallName(outlet.address?.full) || '');
                if (!mallName) return false;
                const key = buildMallKey(mallName, outlet.address?.city, outlet.address?.state);
                const groupKey = getMallGroupKey(mallName);
                if (key === mallKey || groupKey === requestedGroupKey) {
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

        if (mallOutlets.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Mall not found'
            });
        }

        const sampleOutlet = (outlets as any[]).find((outlet) => {
            const mallName = normalizeMallName(extractMallName(outlet.address?.full) || '');
            if (!mallName) return false;
            const key = buildMallKey(mallName, outlet.address?.city, outlet.address?.state);
            const groupKey = getMallGroupKey(mallName);
            return key === mallKey || groupKey === requestedGroupKey;
        }) as any;

        const mallName = normalizeMallName(extractMallName(sampleOutlet?.address?.full) || '') || 'Mall Food Court';
        const configCandidates = await MallQRConfig.find({
            mall_key: { $in: Array.from(matchedMallKeys) }
        }).lean();
        const config = configCandidates.find((candidate) => candidate.mall_key === mallKey) || configCandidates[0] || null;

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
    const requestedGroupKey = extractGroupKeyFromMallKey(mallKey);

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
        const mallName = normalizeMallName(extractMallName(outlet.address?.full) || '');
        if (!mallName) continue;
        const key = buildMallKey(mallName, outlet.address?.city, outlet.address?.state);
        const groupKey = getMallGroupKey(mallName);
        if (key === mallKey || groupKey === requestedGroupKey) {
            return {
                mallName,
                city: outlet.address?.city,
                state: outlet.address?.state
            };
        }
    }

    return null;
};

/**
 * Get all QR cards for an outlet (default + sub-menus).
 * Used by admin QR management page.
 * GET /api/v1/admin/qr/outlets/:outletId/all-qrs
 */
import { OutletSubMenu } from '../models/OutletSubMenu.js';
import { Subscription } from '../models/Subscription.js';
import { normalizePlanToTier } from '../config/subscriptionPlans.js';

export const getAllOutletQRs = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;

        const outlet = await Outlet.findById(outletId)
            .select('name slug qr_code_url approval_status multi_menu_settings subscription_id')
            .lean();

        if (!outlet) {
            return res.status(404).json({ success: false, message: 'Outlet not found' });
        }

        // Build default QR card (always present)
        const baseUrl = process.env.FRONTEND_URL || 'https://app.dynleaf.com';
        const defaultQRUrl = `${baseUrl}/menu/${(outlet as any).slug}`;

        const qrCards: any[] = [
            {
                type: 'default',
                label: 'Default Menu',
                description: 'Shows all items',
                icon: '🍽️',
                qr_url: defaultQRUrl,
                qr_image_url: (outlet as any).qr_code_url || null
            }
        ];

        // Check subscription eligibility for sub-menus
        const sub = await Subscription.findOne({ outlet_id: outletId }).lean();
        const isEligible =
            sub &&
            ['active', 'trial'].includes(sub.status) &&
            normalizePlanToTier(sub.plan) === 'premium' &&
            sub.features.includes('multi_menu');

        if (isEligible) {
            const subMenus = await OutletSubMenu.find({
                outlet_id: outletId,
                is_active: true
            })
                .sort({ display_order: 1 })
                .lean();

            for (const sm of subMenus) {
                qrCards.push({
                    type: 'sub_menu',
                    sub_menu_id: sm._id,
                    label: sm.name,
                    description: sm.description || '',
                    qr_url: `${baseUrl}/menu/${(outlet as any).slug}?sm=${sm.slug}`,
                    qr_image_url: null  // Generated on demand by frontend QR library
                });
            }
        }

        return res.json({
            success: true,
            data: {
                outlet: {
                    _id: (outlet as any)._id,
                    name: (outlet as any).name,
                    slug: (outlet as any).slug
                },
                qr_cards: qrCards,
                sub_menu_active: isEligible && qrCards.length > 1
            }
        });
    } catch (error: any) {
        console.error('Error fetching outlet QR cards:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch QR cards' });
    }
};
