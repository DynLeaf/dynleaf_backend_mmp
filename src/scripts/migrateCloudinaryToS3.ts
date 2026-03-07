import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getS3Service } from '../services/s3Service.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

dotenv.config();

/**
 * Migration script to convert existing Cloudinary URLs to S3
 * 
 * Usage: npm run migrate:cloudinary-to-s3
 * 
 * This script:
 * 1. Finds all documents with Cloudinary URLs
 * 2. Downloads the files from Cloudinary
 * 3. Uploads them to S3
 * 4. Updates database records with new S3 URLs
 */

const TEMP_DIR = path.join(process.cwd(), '.uploads-temp');
const BATCH_SIZE = 10; // Process 10 files at a time

// Database models to migrate
const modelsToMigrate = [
    { name: 'Brand', field: 'logoUrl' },
    { name: 'Outlet', fields: ['coverImageUrl'] },
    { name: 'FoodItem', fields: ['imageUrl'] },
    { name: 'Notification', fields: ['imageUrl'] },
    { name: 'Story', fields: ['mediaUrl'] },
    { name: 'User', fields: ['avatarUrl'] }
];

class CloudinaryToS3Migration {
    private s3Service;
    private totalProcessed = 0;
    private totalFailed = 0;
    private urlMappings: Map<string, string> = new Map();

    constructor() {
        try {
            this.s3Service = getS3Service();
        } catch (error) {
            console.error('❌ S3 service not initialized:', error);
            process.exit(1);
        }
    }

    async run() {
        try {

            // Create temp directory
            if (!fs.existsSync(TEMP_DIR)) {
                fs.mkdirSync(TEMP_DIR, { recursive: true });
            }

            // Find all Cloudinary URLs in database
            const cloudinaryUrls = await this.findAllCloudinaryUrls();

            if (cloudinaryUrls.length === 0) {
                return;
            }

            // Process in batches
            for (let i = 0; i < cloudinaryUrls.length; i += BATCH_SIZE) {
                const batch = cloudinaryUrls.slice(i, i + BATCH_SIZE);

                await Promise.allSettled(
                    batch.map(item => this.migrateUrl(item))
                );
            }

            // Update all documents with new S3 URLs
            await this.updateDatabaseRecords();

            // Cleanup
            this.cleanup();


        } catch (error) {
            console.error('❌ Migration failed:', error);
            this.cleanup();
            process.exit(1);
        }
    }

    private async findAllCloudinaryUrls(): Promise<Array<{ collection: string; field: string; url: string; id: string }>> {
        const urls: Array<{ collection: string; field: string; url: string; id: string }> = [];

        for (const model of modelsToMigrate) {
            try {
                const collection = mongoose.connection.collection(model.name);
                const fields = Array.isArray(model.field) ? (model.field as string[]) : [model.field as string];

                for (const field of fields) {
                    const query: any = {};
                    query[field] = { $regex: 'cloudinary.com', $exists: true };

                    const docs = await collection.find(query).toArray();

                    for (const doc of docs) {
                        const url = doc[field];
                        if (url && url.includes('cloudinary.com')) {
                            urls.push({
                                collection: model.name,
                                field,
                                url,
                                id: doc._id.toString()
                            });
                        }
                    }
                }
            } catch (error: any) {
                console.warn(`⚠️ Error querying ${model.name}: ${error.message}`);
            }
        }

        return urls;
    }

    private async migrateUrl(item: {
        collection: string;
        field: string;
        url: string;
        id: string;
    }): Promise<void> {
        try {
            const { collection, field, url, id } = item;

            // Skip if already migrated
            if (this.urlMappings.has(url)) {
                return;
            }


            // Download file from Cloudinary
            const fileName = this.generateFileName(url);
            const filePath = path.join(TEMP_DIR, fileName);

            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
            fs.writeFileSync(filePath, response.data);

            // Upload to S3
            const buffer = fs.readFileSync(filePath);
            const mimeType = response.headers['content-type'] || 'application/octet-stream';

            // Extract asset type from URL path
            const assetType = this.extractAssetType(url);
            const userId = 'migration-' + new Date().getTime();

            const uploadedFile = await this.s3Service.uploadBuffer(
                buffer,
                assetType,
                userId,
                fileName,
                mimeType,
                true // Enable transformations
            );

            this.urlMappings.set(url, uploadedFile.key);
            this.totalProcessed++;


            // Cleanup temp file
            fs.unlinkSync(filePath);
        } catch (error: any) {
            this.totalFailed++;
        }
    }

    private async updateDatabaseRecords(): Promise<void> {
        for (const [cloudinaryUrl, s3Url] of this.urlMappings.entries()) {
            try {
                // Find which collection this URL belongs to
                for (const model of modelsToMigrate) {
                    const collection = mongoose.connection.collection(model.name);
                    const fields = Array.isArray(model.field) ? (model.field as string[]) : [model.field as string];

                    for (const field of fields) {
                        const query: any = {};
                        query[field] = cloudinaryUrl;

                        const result = await collection.updateMany(
                            query,
                            { $set: { [field]: s3Url } }
                        );


                    }
                }
            } catch (error: any) {
                console.warn(`⚠️ Error updating database: ${error.message}`);
            }
        }
    }

    private generateFileName(cloudinaryUrl: string): string {
        const timestamp = Date.now();
        const ext = this.getFileExtension(cloudinaryUrl);
        return `migration-${timestamp}${ext}`;
    }

    private getFileExtension(url: string): string {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const match = pathname.match(/\.[^/.]+$/);
            return match ? match[0] : '.jpg';
        } catch {
            return '.jpg';
        }
    }

    private extractAssetType(url: string): string {
        // Try to extract asset type from URL path
        if (url.includes('/brands/')) return 'brand_logo';
        if (url.includes('/outlets/')) return 'outlet_cover';
        if (url.includes('/gallery/')) return 'gallery_food';
        if (url.includes('/menu/')) return 'menu_item';
        if (url.includes('/stories/')) return 'story';
        if (url.includes('/avatars/')) return 'avatar';
        if (url.includes('/reels/')) return 'reel_thumbnail';
        return 'gallery_food'; // default
    }

    private cleanup(): void {
        if (fs.existsSync(TEMP_DIR)) {
            fs.rmSync(TEMP_DIR, { recursive: true, force: true });
            console.log('\n🧹 Cleaned up temporary files');
        }
    }
}

// Run migration
const migration = new CloudinaryToS3Migration();
await migration.run();
