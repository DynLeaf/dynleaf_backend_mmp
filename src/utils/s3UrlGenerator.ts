import { getS3Service } from '../services/s3Service.js';

export interface ImageData {
  s3Key?: string;
  url?: string; // Legacy Cloudinary URLs
  publicUrl?: string;
}

/**
 * Utility class to convert S3 keys to signed URLs
 * Handles both S3 keys and legacy Cloudinary URLs
 */
export class S3UrlGenerator {
  /**
   * Convert S3 key to signed URL
   * If the value is already a URL, return as-is (for backward compatibility)
   * @param imageData - S3 key or full URL
   * @param expirySeconds - URL expiry time in seconds (default 1 hour)
   * @returns Signed URL or null if no data provided
   */
  static async resolveUrl(
    imageData: string | ImageData | null | undefined,
    expirySeconds: number = 3600
  ): Promise<string | null> {
    if (!imageData) return null;

    const key = typeof imageData === 'string' ? imageData : (imageData.s3Key || imageData.url);

    if (!key) return null;

    // If it's already a full URL (Cloudinary or S3), return as-is for backward compatibility
    if (key.startsWith('http')) {
      return key;
    }

    // It's an S3 key, generate signed URL
    try {
      const s3Service = getS3Service();
      return await s3Service.generatePresignedGetUrl(key, expirySeconds);
    } catch (error) {
      console.error(`[S3UrlGenerator] Failed to generate URL for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Resolve multiple image URLs in parallel
   * @param imageDataArray - Array of S3 keys or URLs
   * @param expirySeconds - URL expiry time in seconds
   * @returns Array of signed URLs (or null for failed conversions)
   */
  static async resolveUrls(
    imageDataArray: (string | ImageData | null | undefined)[],
    expirySeconds: number = 3600
  ): Promise<(string | null)[]> {
    return Promise.all(
      imageDataArray.map((data) => this.resolveUrl(data, expirySeconds))
    );
  }

  /**
   * Add signed URLs to object without modifying original
   * @param obj - Object containing image fields with S3 keys
   * @param imageFields - Array of field names to convert
   * @param expirySeconds - URL expiry time in seconds
   * @returns New object with signedUrls property
   */
  static async enrichWithUrls<T extends Record<string, any>>(
    obj: T,
    imageFields: (keyof T)[],
    expirySeconds: number = 3600
  ): Promise<T & { signedUrls: Record<string, string | null> }> {
    const signedUrls: Record<string, string | null> = {};

    for (const field of imageFields) {
      const fieldName = String(field);
      signedUrls[fieldName] = await this.resolveUrl(obj[field] as any, expirySeconds);
    }

    return {
      ...obj,
      signedUrls,
    };
  }

  /**
   * Enrich object with XXXUrl properties for each image field
   * More convenient than signedUrls object
   * @param obj - Object containing image fields
   * @param imageFields - Array of field names to convert
   * @param expirySeconds - URL expiry time
   * @returns New object with avatarUrl, logoUrl, etc. properties
   */
  static async enrichWithUrlFields<T extends Record<string, any>>(
    obj: T,
    imageFields: (keyof T)[],
    expirySeconds: number = 3600
  ): Promise<T & Record<string, string | null>> {
    const enriched = { ...obj } as any;

    for (const field of imageFields) {
      const fieldName = String(field);
      enriched[`${fieldName}Url`] = await this.resolveUrl(obj[field] as any, expirySeconds);
    }

    return enriched;
  }

  /**
   * Enrich array of objects with signed URLs
   * @param objects - Array of objects containing image fields
   * @param imageFields - Array of field names to convert
   * @param expirySeconds - URL expiry time
   * @returns Array of enriched objects
   */
  static async enrichArrayWithUrls<T extends Record<string, any>>(
    objects: T[],
    imageFields: (keyof T)[],
    expirySeconds: number = 3600
  ): Promise<(T & Record<string, string | null>)[]> {
    return Promise.all(
      objects.map((obj) => this.enrichWithUrlFields(obj, imageFields, expirySeconds))
    );
  }

  /**
   * Extract S3 key from URL (for backward compatibility)
   * @param url - Full S3 URL
   * @returns S3 key or null
   */
  static extractS3KeyFromUrl(url: string): string | null {
    if (!url) return null;

    // If it's already a key (no http), return as-is
    if (!url.startsWith('http')) {
      return url;
    }

    try {
      // Extract key from S3 URL
      // https://dynleaf.s3.ap-south-1.amazonaws.com/avatars/123/file.webp -> avatars/123/file.webp
      const match = url.match(/\.amazonaws\.com\/(.+?)(?:\?|$)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }

      // If Cloudinary URL, return null (can't extract key)
      if (url.includes('cloudinary.com')) {
        return null;
      }

      // Last resort: parse URL and extract path
      const urlObj = new URL(url);
      const pathKey = urlObj.pathname.substring(1); // Remove leading slash
      return pathKey || null;
    } catch (error) {
      console.warn(`[S3UrlGenerator] Could not extract S3 key from URL: ${url}`);
      return null;
    }
  }
}

export default S3UrlGenerator;
