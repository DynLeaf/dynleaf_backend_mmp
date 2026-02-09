import { Request, Response } from 'express';
import { Outlet } from '../models/Outlet.js';
import OutletQRConfig from '../models/OutletQRConfig.js';

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
        }).select('name slug').lean();

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
