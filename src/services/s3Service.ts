import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    HeadBucketCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

interface S3Config {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucketName: string;
    cdnUrl?: string;
}

interface PresignedUrlResponse {
    uploadUrl: string;
    fields: Record<string, string>;
    s3Key: string;
    bucketName: string;
}

interface UploadedFileInfo {
    key: string;
    url: string;
    size: number;
    mimeType: string;
}

class S3UploadService {
    private s3Client: S3Client;
    private config: S3Config;

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

    /**
     * Validate S3 bucket connectivity
     */
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

    /**
     * Generate presigned POST URL for browser uploads
     * Supports multipart form data uploads directly from frontend
     */
    async generatePresignedPostUrl(
        assetType: string,
        userId: string,
        contentType: string = 'application/octet-stream',
        maxFileSize: number = 104857600 // 100MB default
    ): Promise<PresignedUrlResponse> {
        const s3Key = this.generateS3Key(assetType, userId);
        
        try {
            const uploadUrl = await getSignedUrl(
                this.s3Client,
                new PutObjectCommand({
                    Bucket: this.config.bucketName,
                    Key: s3Key,
                    ContentType: contentType
                }),
                { expiresIn: 900 } // 15 minutes
            );

            return {
                uploadUrl,
                fields: {
                    'Content-Type': contentType
                },
                s3Key,
                bucketName: this.config.bucketName
            };
        } catch (error: any) {
            console.error('❌ [S3] Failed to generate presigned URL:', error.message);
            throw error;
        }
    }

    /**
     * Generate presigned GET URL for reading uploaded files
     */
    async generatePresignedGetUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
        try {
            const url = await getSignedUrl(
                this.s3Client,
                new GetObjectCommand({
                    Bucket: this.config.bucketName,
                    Key: s3Key
                }),
                { expiresIn }
            );
            return url;
        } catch (error: any) {
            console.error('❌ [S3] Failed to generate GET presigned URL:', error.message);
            throw error;
        }
    }

    /**
     * Upload file buffer to S3 with optional image transformation
     */
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

            // Apply Sharp transformations for images
            if (transformImage && mimeType.startsWith('image/')) {
                const transformedBuffer = await this.transformImage(fileBuffer, assetType);
                finalBuffer = transformedBuffer;
                finalMimeType = 'image/webp'; // Convert to WebP for optimized storage
            }

            const s3Key = this.generateS3Key(assetType, userId, fileName);

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

            const fileUrl = this.getFileUrl(s3Key);

            console.log(`✅ [S3] Uploaded ${assetType}/${userId}/${fileName} (${finalBuffer.length} bytes)`);

            return {
                key: s3Key,
                url: fileUrl,
                size: finalBuffer.length,
                mimeType: finalMimeType
            };
        } catch (error: any) {
            console.error('❌ [S3] Upload failed:', error.message);
            throw error;
        }
    }

    /**
     * Delete a single file from S3
     */
    async deleteFile(s3Key: string): Promise<boolean> {
        try {
            if (!this.isValidS3Key(s3Key)) {
                console.warn(`⚠️ [S3] Invalid S3 key: ${s3Key}`);
                return false;
            }

            await this.s3Client.send(
                new DeleteObjectCommand({
                    Bucket: this.config.bucketName,
                    Key: s3Key
                })
            );

            console.log(`✅ [S3] Deleted: ${s3Key}`);
            return true;
        } catch (error: any) {
            console.error(`❌ [S3] Error deleting ${s3Key}:`, error.message);
            return false;
        }
    }

    /**
     * Delete multiple files from S3
     */
    async deleteMultipleFiles(s3Keys: string[]): Promise<{ deleted: number; failed: number }> {
        try {
            const validKeys = s3Keys.filter(key => this.isValidS3Key(key));

            if (validKeys.length === 0) {
                console.warn('⚠️ [S3] No valid keys to delete');
                return { deleted: 0, failed: s3Keys.length };
            }

            await this.s3Client.send(
                new DeleteObjectsCommand({
                    Bucket: this.config.bucketName,
                    Delete: {
                        Objects: validKeys.map(key => ({ Key: key }))
                    }
                })
            );

            console.log(`📊 [S3] Bulk delete: ${validKeys.length} succeeded, ${s3Keys.length - validKeys.length} failed`);
            return { deleted: validKeys.length, failed: s3Keys.length - validKeys.length };
        } catch (error: any) {
            console.error('❌ [S3] Bulk delete failed:', error.message);
            return { deleted: 0, failed: s3Keys.length };
        }
    }

    /**
     * Extract S3 key from URL (handles both CDN and direct S3 URLs)
     */
    extractS3KeyFromUrl(url: string): string | null {
        try {
            if (!url) return null;

            // If CDN URL is configured, check for CDN pattern
            if (this.config.cdnUrl && url.includes(this.config.cdnUrl)) {
                return url.replace(this.config.cdnUrl, '').split('?')[0];
            }

            // Check for direct S3 URL pattern
            // s3.region.amazonaws.com/bucket/key or bucket.s3.region.amazonaws.com/key
            const s3UrlRegex = /(?:s3[.-]|\.s3[.-])[^/]+\.amazonaws\.com\/([^?]+)/;
            const match = url.match(s3UrlRegex);

            if (match) {
                return match[1];
            }

            // Fallback: assume the path is the key
            const urlObj = new URL(url);
            const pathKey = urlObj.pathname.substring(1); // Remove leading slash

            if (this.config.bucketName && pathKey.startsWith(this.config.bucketName)) {
                return pathKey.substring(this.config.bucketName.length + 1);
            }

            return pathKey || null;
        } catch (error: any) {
            console.warn(`⚠️ [S3] Could not extract S3 key from URL: ${url}`, error.message);
            return null;
        }
    }

    /**
     * Safe delete - only delete if URL exists and is an S3 URL
     */
    async safeDeleteFromUrl(
        oldUrl: string | undefined | null,
        newUrl: string | undefined | null
    ): Promise<void> {
        // Only delete if:
        // 1. Old URL exists
        // 2. New URL is different from old URL (or new URL is being cleared)
        // 3. Old URL is an S3 URL
        if (oldUrl && oldUrl !== newUrl && this.isS3Url(oldUrl)) {
            const s3Key = this.extractS3KeyFromUrl(oldUrl);
            if (s3Key) {
                await this.deleteFile(s3Key);
            }
        }
    }

    /**
     * Transform image using Sharp
     * Applies optimization based on asset type
     */
    private async transformImage(buffer: Buffer, assetType: string): Promise<Buffer> {
        try {
            let sharpTransform = sharp(buffer);

            // Apply transformations based on asset type
            const transformConfigs: Record<string, { width?: number; height?: number; quality?: number }> = {
                brand_logo: { width: 2048, height: 2048, quality: 85 },
                outlet_cover: { width: 2048, height: 2048, quality: 85 },
                gallery_interior: { width: 2048, height: 2048, quality: 80 },
                gallery_exterior: { width: 2048, height: 2048, quality: 80 },
                gallery_food: { width: 2048, height: 2048, quality: 85 },
                menu_item: { width: 2048, height: 2048, quality: 85 },
                avatar: { width: 512, height: 512, quality: 80 },
                story: { width: 1080, height: 1920, quality: 75 },
                reel_thumbnail: { width: 1280, height: 720, quality: 80 }
            };

            const config = transformConfigs[assetType];
            if (config) {
                sharpTransform = sharpTransform.resize(config.width, config.height, {
                    fit: 'inside',
                    withoutEnlargement: true
                });
            }

            // Convert to WebP and optimize
            const transformed = await sharpTransform
                .webp({ quality: config?.quality || 80 })
                .toBuffer();

            console.log(`📦 [S3] Image transformed: ${assetType} (${buffer.length} → ${transformed.length} bytes)`);
            return transformed;
        } catch (error: any) {
            console.warn(`⚠️ [S3] Image transformation failed, using original:`, error.message);
            return buffer;
        }
    }

    /**
     * Generate S3 key following Cloudinary folder structure
     */
    private generateS3Key(assetType: string, userId: string, fileName?: string): string {
        const assetTypeToFolder: Record<string, string> = {
            brand_logo: 'brands',
            outlet_cover: 'outlets',
            gallery_interior: 'gallery/interior',
            gallery_exterior: 'gallery/exterior',
            gallery_food: 'gallery/food',
            menu_item: 'menu',
            story: 'stories',
            avatar: 'avatars',
            reel_thumbnail: 'reels'
        };

        const folder = assetTypeToFolder[assetType] || 'uploads';
        const baseName = fileName ? fileName.replace(/\s+/g, '-').split('.')[0] : 'upload';
        const uniqueId = `${baseName}-${uuidv4()}`;
        const ext = fileName ? fileName.substring(fileName.lastIndexOf('.')) : '.webp';

        return `${folder}/${userId}/${uniqueId}${ext}`;
    }

    /**
     * Check if URL is an S3 URL
     */
    private isS3Url(url: string): boolean {
        return url?.includes('amazonaws.com') || !!(this.config.cdnUrl && url?.includes(this.config.cdnUrl));
    }

    /**
     * Validate S3 key format
     */
    private isValidS3Key(key: string): boolean {
        return !!(key && typeof key === 'string' && key.length > 0 && !key.includes('//'));
    }

    /**
     * Get file URL (make public for URL conversion utility)
     */
    public getFileUrl(s3Key: string): string {
        if (this.config.cdnUrl) {
            return `${this.config.cdnUrl}/${s3Key}`;
        }

        // Direct S3 URL
        return `https://${this.config.bucketName}.s3.${this.config.region}.amazonaws.com/${s3Key}`;
    }
}

// Singleton instance
let s3Service: S3UploadService | null = null;

/**
 * Initialize S3 service
 */
export const initializeS3Service = (config: S3Config): S3UploadService => {
    s3Service = new S3UploadService(config);
    return s3Service;
};

/**
 * Get S3 service instance
 */
export const getS3Service = (): S3UploadService => {
    if (!s3Service) {
        throw new Error('S3 service not initialized. Call initializeS3Service first.');
    }
    return s3Service;
};

export default S3UploadService;
