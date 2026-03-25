import { Request, Response } from 'express';
import { qrConfigService } from '../../services/qr/qrConfigService.js';
import { outletQRRepository } from '../../repositories/qr/outletQRRepository.js';
import * as outletRepository from '../../repositories/outletRepository.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { normalizePlanToTier } from '../../config/subscriptionPlans.js';

export const getApprovedOutlets = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 50, search = '' } = req.query;
        const result = await qrConfigService.getApprovedOutletsWithConfig(Number(page), Number(limit), String(search));
        return sendSuccess(res, result);
    } catch (error: unknown) { return sendError(res, (error as Error).message); }
};

export const getOutletQRConfig = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const outlet = await outletRepository.findByIdLean(outletId) as { approval_status?: string; _id: unknown; slug: string; name: string; qr_code_url?: string } | null;
        if (!outlet || outlet.approval_status !== 'APPROVED') return sendError(res, 'Outlet not found or not approved', 404);
        const qrConfig = await outletQRRepository.findByOutletId(outletId);
        return sendSuccess(res, { outlet, qr_config: qrConfig || null });
    } catch (error: unknown) { return sendError(res, (error as Error).message); }
};

export const updateOutletQRConfig = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const { table_count } = req.body as { table_count: number };
        if (!table_count || table_count < 1 || table_count > 1000) return sendError(res, 'Table count must be between 1 and 1000', 400);
        const outlet = await outletRepository.findByIdLean(outletId) as { approval_status?: string } | null;
        if (!outlet || outlet.approval_status !== 'APPROVED') return sendError(res, 'Outlet not found or not approved', 404);
        const config = await outletQRRepository.upsertConfig(outletId, Number(table_count));
        return sendSuccess(res, config, 'QR configuration updated');
    } catch (error: unknown) { return sendError(res, (error as Error).message); }
};

export const getAllOutletQRs = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params;
        const outlet = await outletRepository.findByIdLean(outletId) as { _id: unknown; slug: string; name: string; qr_code_url?: string } | null;
        if (!outlet) return sendError(res, 'Outlet not found', 404);

        const baseUrl = process.env.FRONTEND_URL || 'https://app.dynleaf.com';
        const defaultQRUrl = `${baseUrl}/menu/${outlet.slug}`;
        const qrCards: Array<Record<string, unknown>> = [{
            type: 'default', label: 'Default Menu', description: 'Shows all items', icon: '🍽️',
            qr_url: defaultQRUrl, qr_image_url: outlet.qr_code_url || null
        }];

        const sub = await outletRepository.findSubscriptionByOutletIdStr(outletId) as { status?: string; plan?: string; features?: string[] } | null;
        const isEligible = sub && ['active', 'trial'].includes(sub.status || '') &&
            normalizePlanToTier(sub.plan ?? 'free') === 'premium' &&
            sub.features?.includes('multi_menu');

        if (isEligible) {
            const subMenus = await outletRepository.findOutletSubMenusActive(outletId) as Array<{ _id: unknown; name: string; slug: string; description?: string }>;
            for (const sm of subMenus) {
                qrCards.push({ type: 'sub_menu', sub_menu_id: sm._id, label: sm.name, description: sm.description || '', qr_url: `${baseUrl}/menu/${outlet.slug}?sm=${sm.slug}`, qr_image_url: null });
            }
        }

        return sendSuccess(res, {
            outlet: { _id: outlet._id, name: outlet.name, slug: outlet.slug },
            qr_cards: qrCards, sub_menu_active: isEligible && qrCards.length > 1
        });
    } catch (error: unknown) { return sendError(res, (error as Error).message); }
};
