import { Request, Response } from 'express';
import * as promotionService from '../services/promotionService.js';
import * as promotionTrackingService from '../services/promotionTrackingService.js';
import { getS3Service } from '../services/s3Service.js';
import { sendSuccess, sendError } from '../utils/response.js';

export const createPromotion = async (req: Request, res: Response) => {
    try {
        const promotion = await promotionService.createPromotion(req.body);
        return sendSuccess(res, { promotion }, null, 201);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to create promotion', err.statusCode ?? 500);
    }
};

export const getPromotions = async (req: Request, res: Response) => {
    try {
        const result = await promotionService.getPromotions(req.query as Record<string, unknown>);
        return sendSuccess(res, result);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to fetch promotions', err.statusCode ?? 500);
    }
};

export const getPromotion = async (req: Request, res: Response) => {
    try {
        const promotion = await promotionService.getPromotion(req.params.id);
        return sendSuccess(res, { promotion });
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to fetch promotion', err.statusCode ?? 500);
    }
};

export const updatePromotion = async (req: Request, res: Response) => {
    try {
        const promotion = await promotionService.updatePromotion(req.params.id, req.body);
        return sendSuccess(res, { promotion });
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to update promotion', err.statusCode ?? 500);
    }
};

export const togglePromotionStatus = async (req: Request, res: Response) => {
    try {
        const result = await promotionService.togglePromotionStatus(req.params.id);
        return sendSuccess(res, result);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to toggle promotion status', err.statusCode ?? 500);
    }
};

export const deletePromotion = async (req: Request, res: Response) => {
    try {
        await promotionService.deletePromotion(req.params.id);
        return sendSuccess(res, { message: 'Promotion deleted successfully' });
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to delete promotion', err.statusCode ?? 500);
    }
};

export const getPromotionAnalytics = async (req: Request, res: Response) => {
    try {
        const result = await promotionService.getPromotionAnalytics(req.params.id, req.query as Record<string, unknown>);
        return sendSuccess(res, result);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to fetch analytics', err.statusCode ?? 500);
    }
};

export const trackImpression = async (req: Request, res: Response) => {
    try {
        const userAgent = (req.headers['user-agent'] as string) || '';
        const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress;
        const result = await promotionTrackingService.trackImpression(req.params.id, req.body.session_id, userAgent, ipAddress);
        return sendSuccess(res, result);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to track impression', err.statusCode ?? 500);
    }
};

export const trackClick = async (req: Request, res: Response) => {
    try {
        const userAgent = (req.headers['user-agent'] as string) || '';
        const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress;
        const result = await promotionTrackingService.trackClick(req.params.id, req.body.session_id, userAgent, ipAddress);
        return sendSuccess(res, result);
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to track click', err.statusCode ?? 500);
    }
};

export const getFeaturedPromotions = async (req: Request, res: Response) => {
    try {
        const promotions = await promotionService.getFeaturedPromotions(req.query as Record<string, unknown>);
        return sendSuccess(res, { promotions });
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to fetch featured promotions', err.statusCode ?? 500);
    }
};

export const getS3SignatureForPromotion = async (req: Request, res: Response) => {
    try {
        const s3Service = getS3Service();
        const userId = (req as Request & { user?: { id: string } }).user?.id || 'admin';
        const mimeType = req.body?.mimeType || 'image/webp';
        const maxFileSize = 5 * 1024 * 1024;

        const presignedResponse = await s3Service.generatePresignedPostUrl('promotion_banner', userId, mimeType, maxFileSize);
        const fileUrl = s3Service.getFileUrl(presignedResponse.s3Key);

        return sendSuccess(res, {
            uploadUrl: presignedResponse.uploadUrl, fields: presignedResponse.fields,
            s3Key: presignedResponse.s3Key, fileUrl, bucketName: presignedResponse.bucketName,
            region: process.env.AWS_REGION || 'ap-south-2', provider: 's3', maxFileSize, expiresIn: 900
        });
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to get upload signature', 500);
    }
};

export const uploadPromotionImageViaBackend = async (req: Request, res: Response) => {
    try {
        const s3Service = getS3Service();
        const userId = (req as Request & { user?: { id: string } }).user?.id || 'admin';
        const { fileBuffer, fileName, mimeType } = req.body || {};

        if (!fileBuffer || !fileName) {
            return sendError(res, 'fileBuffer and fileName are required', 400);
        }

        const buffer = Buffer.from(fileBuffer as string, 'base64');
        const uploadedFile = await s3Service.uploadBuffer(buffer, 'promotion_banner', userId, fileName, mimeType || 'application/octet-stream');

        return sendSuccess(res, {
            s3Key: uploadedFile.key, fileUrl: s3Service.getFileUrl(uploadedFile.key),
            size: uploadedFile.size, mimeType: uploadedFile.mimeType
        });
    } catch (error: unknown) {
        const err = error as Error & { statusCode?: number };
        return sendError(res, err.message || 'Failed to upload promotion image', 500);
    }
};
