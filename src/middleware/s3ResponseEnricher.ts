import { Response, NextFunction } from 'express';
import S3UrlGenerator from '../utils/s3UrlGenerator.js';

export interface S3EnricherOptions {
  imageFields?: string[];
  expirySeconds?: number;
  autoEnrich?: boolean;
}

/**
 * Middleware to automatically convert S3 keys to signed URLs in API responses
 * Wraps res.json() to enrich response data with signed URLs transparently
 *
 * Usage:
 * app.use(s3ResponseEnricher({
 *   imageFields: ['avatar', 'profileImage', 'logo', 'coverImage'],
 *   expirySeconds: 3600
 * }))
 *
 * Response enrichment:
 * Before: { avatar: "avatars/123/file.webp" }
 * After:  { avatar: "avatars/123/file.webp", avatarUrl: "https://..." }
 */
export const s3ResponseEnricher = (options?: S3EnricherOptions) => {
  const {
    imageFields = ['avatar', 'profileImage', 'image', 'coverImage', 'logo', 'bannerImage'],
    expirySeconds = 3600,
    autoEnrich = true
  } = options || {};

  return (req: any, res: Response, next: NextFunction) => {
    if (!autoEnrich) {
      return next();
    }

    const originalJson = res.json.bind(res);

    // Override res.json to enrich response with signed URLs
    res.json = function (body: any) {
      // Skip enrichment for error responses or non-standard formats
      if (!body || typeof body !== 'object' || body.status === false) {
        return originalJson.call(this, body);
      }

      // Handle data array
      if (body?.data && Array.isArray(body.data)) {
        enrichArray(body.data, imageFields, expirySeconds)
          .then((enriched) => {
            originalJson.call(this, { ...body, data: enriched });
          })
          .catch((error) => {
            console.error('[S3ResponseEnricher] Failed to enrich array response:', error);
            originalJson.call(this, body);
          });
        return this;
      }

      // Handle single object
      if (body?.data && typeof body.data === 'object' && body.data !== null) {
        enrichObject(body.data, imageFields, expirySeconds)
          .then((enriched) => {
            originalJson.call(this, { ...body, data: enriched });
          })
          .catch((error) => {
            console.error('[S3ResponseEnricher] Failed to enrich response:', error);
            originalJson.call(this, body);
          });
        return this;
      }

      return originalJson.call(this, body);
    };

    next();
  };
};

/**
 * Enrich a single object with signed URLs
 * Adds XXXUrl properties for each image field
 */
async function enrichObject(
  obj: any,
  imageFields: string[],
  expirySeconds: number
): Promise<any> {
  const enriched = { ...obj };

  for (const field of imageFields) {
    if (obj[field]) {
      try {
        enriched[`${field}Url`] = await S3UrlGenerator.resolveUrl(obj[field], expirySeconds);
      } catch (error) {
        console.warn(`[S3ResponseEnricher] Failed to enrich field ${field}:`, error);
        enriched[`${field}Url`] = null;
      }
    }
  }

  return enriched;
}

/**
 * Enrich array of objects with signed URLs
 */
async function enrichArray(
  arr: any[],
  imageFields: string[],
  expirySeconds: number
): Promise<any[]> {
  return Promise.all(
    arr.map((item) => {
      if (typeof item === 'object' && item !== null) {
        return enrichObject(item, imageFields, expirySeconds);
      }
      return item;
    })
  );
}

export default s3ResponseEnricher;
