import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3BaseService } from './S3BaseService.js';
import { S3KeyHelper } from './S3KeyHelper.js';
import type { PresignedUrlResponse } from './types.js';

export class S3UrlService extends S3BaseService {
    async generatePresignedPostUrl(
        assetType: string,
        userId: string,
        contentType: string = 'application/octet-stream',
        _maxFileSize?: number
    ): Promise<PresignedUrlResponse> {
        const s3Key = S3KeyHelper.generateS3Key(assetType, userId);
        try {
            const uploadUrl = await getSignedUrl(
                this.s3Client,
                new PutObjectCommand({
                    Bucket: this.config.bucketName,
                    Key: s3Key,
                    ContentType: contentType
                }),
                { expiresIn: 900 }
            );

            return {
                uploadUrl,
                fields: { 'Content-Type': contentType },
                s3Key,
                bucketName: this.config.bucketName
            };
        } catch (error: any) {
            console.error('❌ [S3] Failed to generate presigned URL:', error.message);
            throw error;
        }
    }

    async generatePresignedGetUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
        try {
            return await getSignedUrl(
                this.s3Client,
                new GetObjectCommand({
                    Bucket: this.config.bucketName,
                    Key: s3Key
                }),
                { expiresIn }
            );
        } catch (error: any) {
            console.error('❌ [S3] Failed to generate GET presigned URL:', error.message);
            throw error;
        }
    }
}
