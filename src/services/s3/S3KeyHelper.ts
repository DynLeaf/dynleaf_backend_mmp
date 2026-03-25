import { v4 as uuidv4 } from 'uuid';

export class S3KeyHelper {
    static generateS3Key(assetType: string, userId: string, fileName?: string): string {
        const assetTypeToFolder: Record<string, string> = {
            brand_logo: 'brands',
            outlet_cover: 'outlets',
            gallery_interior: 'gallery/interior',
            gallery_exterior: 'gallery/exterior',
            gallery_food: 'gallery/food',
            menu_item: 'menu',
            story: 'stories',
            avatar: 'avatars',
            reel_thumbnail: 'reels',
            category_image: 'categories',
            promotion_banner: 'promotions',
        };

        const folder = assetTypeToFolder[assetType] || 'uploads';
        const baseName = fileName ? fileName.replace(/\s+/g, '-').split('.')[0] : 'upload';
        const uniqueId = `${baseName}-${uuidv4()}`;
        const ext = fileName ? fileName.substring(fileName.lastIndexOf('.')) : '.webp';

        return `${folder}/${userId}/${uniqueId}${ext}`;
    }

    static extractS3KeyFromUrl(url: string, config: { cdnUrl?: string, bucketName: string }): string | null {
        try {
            if (!url) return null;

            if (config.cdnUrl && url.includes(config.cdnUrl)) {
                return url.replace(config.cdnUrl, '').split('?')[0].replace(/^\//, '');
            }

            const s3UrlRegex = /(?:s3[.-]|\.s3[.-])[^/]+\.amazonaws\.com\/([^?]+)/;
            const match = url.match(s3UrlRegex);

            if (match) return match[1];

            const urlObj = new URL(url);
            const pathKey = urlObj.pathname.substring(1);

            if (config.bucketName && pathKey.startsWith(config.bucketName)) {
                return pathKey.substring(config.bucketName.length + 1);
            }

            return pathKey || null;
        } catch (error: any) {
            console.warn(`⚠️ [S3] Could not extract S3 key from URL: ${url}`, error.message);
            return null;
        }
    }

    static isValidS3Key(key: string): boolean {
        return !!(key && typeof key === 'string' && key.length > 0 && !key.includes('//'));
    }

    static isS3Url(url: string, config: { cdnUrl?: string }): boolean {
        return url?.includes('amazonaws.com') || !!(config.cdnUrl && url?.includes(config.cdnUrl));
    }
}
