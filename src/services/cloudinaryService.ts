import { v2 as cloudinary } from 'cloudinary';

// Initialize Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Extract public_id from Cloudinary URL
 * Example: https://res.cloudinary.com/demo/image/upload/v1234/menu/user123/abc-def.jpg
 * Returns: menu/user123/abc-def
 */
export const extractPublicId = (cloudinaryUrl: string): string | null => {
    if (!cloudinaryUrl || typeof cloudinaryUrl !== 'string') return null;

    // Skip if not a Cloudinary URL
    if (!cloudinaryUrl.includes('cloudinary.com')) return null;

    // Match Cloudinary URL pattern
    // Handles both versioned and non-versioned URLs
    const regex = /cloudinary\.com\/[^\/]+\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/;
    const match = cloudinaryUrl.match(regex);

    return match ? match[2] : null;
};

/**
 * Delete a single image/video from Cloudinary
 * This is a fire-and-forget operation - failures are logged but don't throw errors
 */
export const deleteFromCloudinary = async (
    imageUrl: string,
    resourceType: 'image' | 'video' | 'raw' = 'image'
): Promise<boolean> => {
    try {
        const publicId = extractPublicId(imageUrl);
        if (!publicId) {
            console.warn(`[Cloudinary] Could not extract public_id from URL: ${imageUrl}`);
            return false;
        }

        const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });

        if (result.result === 'ok') {
            console.log(`✅ [Cloudinary] Successfully deleted: ${publicId}`);
            return true;
        } else if (result.result === 'not found') {
            console.warn(`⚠️ [Cloudinary] Image not found (may have been already deleted): ${publicId}`);
            return false;
        } else {
            console.warn(`⚠️ [Cloudinary] Delete returned: ${result.result} for ${publicId}`);
            return false;
        }
    } catch (error: any) {
        console.error(`❌ [Cloudinary] Error deleting ${imageUrl}:`, error.message);
        return false;
    }
};

/**
 * Delete multiple images/videos from Cloudinary
 * Returns count of successful and failed deletions
 */
export const bulkDeleteFromCloudinary = async (
    imageUrls: string[],
    resourceType: 'image' | 'video' | 'raw' = 'image'
): Promise<{ deleted: number; failed: number }> => {
    const results = await Promise.allSettled(
        imageUrls.map(url => deleteFromCloudinary(url, resourceType))
    );

    const deleted = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    const failed = results.length - deleted;

    console.log(`📊 [Cloudinary] Bulk delete: ${deleted} succeeded, ${failed} failed`);
    return { deleted, failed };
};

/**
 * Helper to safely delete an image URL if it exists
 * Used in update operations to delete old images
 */
export const safeDeleteFromCloudinary = async (
    oldUrl: string | undefined | null,
    newUrl: string | undefined | null,
    resourceType: 'image' | 'video' | 'raw' = 'image'
): Promise<void> => {
    // Only delete if:
    // 1. Old URL exists
    // 2. New URL is different from old URL (or new URL is being cleared)
    // 3. Old URL is a Cloudinary URL
    if (oldUrl && oldUrl !== newUrl && oldUrl.includes('cloudinary.com')) {
        await deleteFromCloudinary(oldUrl, resourceType);
    }
};
