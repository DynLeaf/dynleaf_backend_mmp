import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { S3Config } from './types.js';

export class S3BaseService {
    protected s3Client: S3Client;
    protected config: S3Config;

    constructor(config: S3Config) {
        this.config = config;
        this.s3Client = new S3Client({
            region: config.region,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey
            }
        });
    }

    async validateBucket(): Promise<boolean> {
        try {
            await this.s3Client.send(new HeadBucketCommand({
                Bucket: this.config.bucketName
            }));
            console.log('✅ [S3] Bucket validation successful');
            return true;
        } catch (error: any) {
            console.error('❌ [S3] Bucket validation failed:', error.message);
            return false;
        }
    }

    getFileUrl(s3Key: string): string {
        if (this.config.cdnUrl) {
            return `${this.config.cdnUrl.replace(/\/$/, '')}/${s3Key.replace(/^\//, '')}`;
        }
        return `https://${this.config.bucketName}.s3.${this.config.region}.amazonaws.com/${s3Key}`;
    }
}
