import { DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { S3BaseService } from './S3BaseService.js';
import { S3KeyHelper } from './S3KeyHelper.js';

export class S3DeleteManager extends S3BaseService {
    async deleteFile(s3Key: string): Promise<boolean> {
        try {
            if (!S3KeyHelper.isValidS3Key(s3Key)) return false;

            await this.s3Client.send(
                new DeleteObjectCommand({
                    Bucket: this.config.bucketName,
                    Key: s3Key
                })
            );
            return true;
        } catch (error: any) {
            console.error(`❌ [S3] Error deleting ${s3Key}:`, error.message);
            return false;
        }
    }

    async deleteMultipleFiles(s3Keys: string[]): Promise<{ deleted: number; failed: number }> {
        try {
            const validKeys = s3Keys.filter(key => S3KeyHelper.isValidS3Key(key));
            if (validKeys.length === 0) return { deleted: 0, failed: s3Keys.length };

            await this.s3Client.send(
                new DeleteObjectsCommand({
                    Bucket: this.config.bucketName,
                    Delete: { Objects: validKeys.map(key => ({ Key: key })) }
                })
            );
            return { deleted: validKeys.length, failed: s3Keys.length - validKeys.length };
        } catch (error: any) {
            console.error('❌ [S3] Bulk delete failed:', error.message);
            return { deleted: 0, failed: s3Keys.length };
        }
    }

    async safeDeleteFromUrl(
        oldUrl: string | undefined | null,
        newUrl: string | undefined | null
    ): Promise<void> {
        if (oldUrl && oldUrl !== newUrl && S3KeyHelper.isS3Url(oldUrl, this.config)) {
            const s3Key = S3KeyHelper.extractS3KeyFromUrl(oldUrl, this.config);
            if (s3Key) await this.deleteFile(s3Key);
        }
    }
}
