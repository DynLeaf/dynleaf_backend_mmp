import { getS3Service } from '../s3Service.js';
import { AppError } from '../../errors/AppError.js';

export class QRGenerationService {
    async uploadMallImage(userId: string, fileBuffer: string, fileName: string, mimeType?: string) {
        const s3Service = getS3Service();
        
        if (!fileBuffer || !fileName) {
            throw new AppError('fileBuffer and fileName are required', 400);
        }

        const buffer = Buffer.from(fileBuffer, 'base64');

        const uploadedFile = await s3Service.uploadBuffer(
            buffer,
            'mall_image',
            userId || 'admin',
            fileName,
            mimeType || 'application/octet-stream'
        );

        return {
            s3Key: uploadedFile.key,
            fileUrl: s3Service.getFileUrl(uploadedFile.key),
            size: uploadedFile.size,
            mimeType: uploadedFile.mimeType,
        };
    }
}

export const qrGenerationService = new QRGenerationService();
