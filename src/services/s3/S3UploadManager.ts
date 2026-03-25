import { PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { S3BaseService } from './S3BaseService.js';
import { S3KeyHelper } from './S3KeyHelper.js';
import type { UploadedFileInfo } from './types.js';

export class S3UploadManager extends S3BaseService {
    async uploadBuffer(
        fileBuffer: Buffer,
        assetType: string,
        userId: string,
        fileName: string,
        mimeType: string,
        transformImage: boolean = true
    ): Promise<UploadedFileInfo> {
        try {
            let finalBuffer = fileBuffer;
            let finalMimeType = mimeType;

            if (transformImage && mimeType.startsWith('image/')) {
                finalBuffer = await this.transformImage(fileBuffer, assetType);
                finalMimeType = 'image/webp';
            }

            const s3Key = S3KeyHelper.generateS3Key(assetType, userId, fileName);

            await this.s3Client.send(
                new PutObjectCommand({
                    Bucket: this.config.bucketName,
                    Key: s3Key,
                    Body: finalBuffer,
                    ContentType: finalMimeType,
                    Metadata: {
                        'user-id': userId,
                        'asset-type': assetType,
                        'original-name': fileName,
                        'upload-timestamp': new Date().toISOString()
                    }
                })
            );

            return {
                key: s3Key,
                url: this.getFileUrl(s3Key),
                size: finalBuffer.length,
                mimeType: finalMimeType
            };
        } catch (error: any) {
            console.error('❌ [S3] Upload failed:', error.message);
            throw error;
        }
    }

    private async transformImage(buffer: Buffer, assetType: string): Promise<Buffer> {
        try {
            let sharpTransform = sharp(buffer);
            const transformConfigs: Record<string, { width?: number; height?: number; quality?: number }> = {
                brand_logo: { width: 2048, height: 2048, quality: 85 },
                outlet_cover: { width: 2048, height: 2048, quality: 85 },
                gallery_interior: { width: 2048, height: 2048, quality: 80 },
                gallery_exterior: { width: 2048, height: 2048, quality: 80 },
                gallery_food: { width: 2048, height: 2048, quality: 85 },
                menu_item: { width: 2048, height: 2048, quality: 85 },
                avatar: { width: 512, height: 512, quality: 80 },
                story: { width: 1080, height: 1920, quality: 75 },
                reel_thumbnail: { width: 1280, height: 720, quality: 80 },
                category_image: { width: 800, height: 800, quality: 85 },
            };

            const config = transformConfigs[assetType];
            if (config) {
                sharpTransform = sharpTransform.resize(config.width, config.height, {
                    fit: 'inside',
                    withoutEnlargement: true
                });
            }

            return await sharpTransform.webp({ quality: config?.quality || 80 }).toBuffer();
        } catch (error: any) {
            console.warn(`⚠️ [S3] Image transformation failed, using original:`, error.message);
            return buffer;
        }
    }
}
