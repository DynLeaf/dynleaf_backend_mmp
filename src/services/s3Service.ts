import type { S3Config, PresignedUrlResponse, UploadedFileInfo } from './s3/types.js';
import { S3KeyHelper } from './s3/S3KeyHelper.js';
import { S3UrlService } from './s3/S3UrlService.js';
import { S3UploadManager } from './s3/S3UploadManager.js';
import { S3DeleteManager } from './s3/S3DeleteManager.js';

class S3UploadService {
    private urlService: S3UrlService;
    private uploadManager: S3UploadManager;
    private deleteManager: S3DeleteManager;
    private config: S3Config;

    constructor(config: S3Config) {
        this.config = config;
        this.urlService = new S3UrlService(config);
        this.uploadManager = new S3UploadManager(config);
        this.deleteManager = new S3DeleteManager(config);
    }

    async validateBucket(): Promise<boolean> {
        return this.urlService.validateBucket();
    }

    async generatePresignedPostUrl(
        assetType: string,
        userId: string,
        contentType: string = 'application/octet-stream',
        maxFileSize?: number
    ): Promise<PresignedUrlResponse> {
        return this.urlService.generatePresignedPostUrl(assetType, userId, contentType, maxFileSize);
    }

    async generatePresignedGetUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
        return this.urlService.generatePresignedGetUrl(s3Key, expiresIn);
    }

    async uploadBuffer(
        fileBuffer: Buffer,
        assetType: string,
        userId: string,
        fileName: string,
        mimeType: string,
        transformImage: boolean = true
    ): Promise<UploadedFileInfo> {
        return this.uploadManager.uploadBuffer(fileBuffer, assetType, userId, fileName, mimeType, transformImage);
    }

    async deleteFile(s3Key: string): Promise<boolean> {
        return this.deleteManager.deleteFile(s3Key);
    }

    async deleteMultipleFiles(s3Keys: string[]): Promise<{ deleted: number; failed: number }> {
        return this.deleteManager.deleteMultipleFiles(s3Keys);
    }

    extractS3KeyFromUrl(url: string): string | null {
        return S3KeyHelper.extractS3KeyFromUrl(url, this.config);
    }

    async safeDeleteFromUrl(
        oldUrl: string | undefined | null,
        newUrl: string | undefined | null
    ): Promise<void> {
        return this.deleteManager.safeDeleteFromUrl(oldUrl, newUrl);
    }

    public getFileUrl(s3Key: string): string {
        return this.urlService.getFileUrl(s3Key);
    }
}

let s3Service: S3UploadService | null = null;

export const initializeS3Service = (config: S3Config): S3UploadService => {
    s3Service = new S3UploadService(config);
    return s3Service;
};

export const getS3Service = (): S3UploadService => {
    if (!s3Service) {
        throw new Error('S3 service not initialized. Call initializeS3Service first.');
    }
    return s3Service;
};

export default S3UploadService;
export type { S3Config, PresignedUrlResponse, UploadedFileInfo };
