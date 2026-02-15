#!/usr/bin/env node

import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3UrlGenerator } from '../utils/s3UrlGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Migrate all image URLs in database to S3 keys only
 * Extracts the key portion from full S3 URLs
 * Preserves Cloudinary URLs for separate migration
 *
 * Usage: npm run migrate:urls-to-s3-keys
 */

async function extractS3KeyFromUrl(url: string): Promise<string | null> {
  if (!url) return null;

  // If it's already an S3 key (no http), return as-is
  if (!url.startsWith('http')) {
    return url;
  }

  // Use the utility function
  return S3UrlGenerator.extractS3KeyFromUrl(url);
}

async function migrateUserAvatars(): Promise<{ updated: number; skipped: number }> {
  console.log('[Migration] Starting User avatar migration...');

  try {
    const User = (await import('../models/user.js')).default;
    const users = await User.find({ avatar: { $exists: true, $ne: null, $ne: '' } });

    let updated = 0;
    let skipped = 0;

    for (const user of users) {
      if (user.avatar?.startsWith('http')) {
        const s3Key = await extractS3KeyFromUrl(user.avatar);
        if (s3Key && !s3Key.startsWith('http')) {
          await User.updateOne({ _id: user._id }, { avatar: s3Key });
          logger.info(`[Migration] User ${user._id}: ${user.avatar.substring(0, 50)}... → ${s3Key}`);
          updated++;
        } else {
          logger.warn(`[Migration] User ${user._id}: Could not extract key from ${user.avatar.substring(0, 50)}...`);
          skipped++;
        }
      }
    }

    logger.info(`[Migration] User avatars: ${updated} updated, ${skipped} skipped`);
    return { updated, skipped };
  } catch (error) {
    logger.error('[Migration] User avatar migration failed:', error);
    return { updated: 0, skipped: 0 };
  }
}

async function migrateBrandImages(): Promise<{ updated: number; skipped: number }> {
  logger.info('[Migration] Starting Brand image migration...');

  try {
    const Brand = (await import('../models/brand.js')).default;
    const brands = await Brand.find({
      $or: [
        { logo: { $exists: true, $ne: null, $ne: '' } },
        { coverImage: { $exists: true, $ne: null, $ne: '' } },
      ],
    });

    let updated = 0;
    let skipped = 0;

    for (const brand of brands) {
      const updates: any = {};

      if (brand.logo?.startsWith('http')) {
        const s3Key = await extractS3KeyFromUrl(brand.logo);
        if (s3Key && !s3Key.startsWith('http')) {
          updates.logo = s3Key;
        } else {
          skipped++;
        }
      }

      if (brand.coverImage?.startsWith('http')) {
        const s3Key = await extractS3KeyFromUrl(brand.coverImage);
        if (s3Key && !s3Key.startsWith('http')) {
          updates.coverImage = s3Key;
        } else {
          skipped++;
        }
      }

      if (Object.keys(updates).length > 0) {
        await Brand.updateOne({ _id: brand._id }, updates);
        logger.info(`[Migration] Brand ${brand._id}: Updated ${Object.keys(updates).join(', ')}`);
        updated++;
      }
    }

    logger.info(`[Migration] Brand images: ${updated} updated, ${skipped} skipped`);
    return { updated, skipped };
  } catch (error) {
    logger.error('[Migration] Brand image migration failed:', error);
    return { updated: 0, skipped: 0 };
  }
}

async function migrateOutletImages(): Promise<{ updated: number; skipped: number }> {
  logger.info('[Migration] Starting Outlet image migration...');

  try {
    const Outlet = (await import('../models/outlet.js')).default;
    const outlets = await Outlet.find({
      $or: [
        { image: { $exists: true, $ne: null, $ne: '' } },
        { coverImage: { $exists: true, $ne: null, $ne: '' } },
      ],
    });

    let updated = 0;
    let skipped = 0;

    for (const outlet of outlets) {
      const updates: any = {};

      if (outlet.image?.startsWith('http')) {
        const s3Key = await extractS3KeyFromUrl(outlet.image);
        if (s3Key && !s3Key.startsWith('http')) {
          updates.image = s3Key;
        } else {
          skipped++;
        }
      }

      if (outlet.coverImage?.startsWith('http')) {
        const s3Key = await extractS3KeyFromUrl(outlet.coverImage);
        if (s3Key && !s3Key.startsWith('http')) {
          updates.coverImage = s3Key;
        } else {
          skipped++;
        }
      }

      if (Object.keys(updates).length > 0) {
        await Outlet.updateOne({ _id: outlet._id }, updates);
        logger.info(`[Migration] Outlet ${outlet._id}: Updated ${Object.keys(updates).join(', ')}`);
        updated++;
      }
    }

    logger.info(`[Migration] Outlet images: ${updated} updated, ${skipped} skipped`);
    return { updated, skipped };
  } catch (error) {
    logger.error('[Migration] Outlet image migration failed:', error);
    return { updated: 0, skipped: 0 };
  }
}

async function migrateMenuItemImages(): Promise<{ updated: number; skipped: number }> {
  logger.info('[Migration] Starting MenuItem image migration...');

  try {
    const MenuItem = (await import('../models/menuItem.js')).default;
    const items = await MenuItem.find({ image: { $exists: true, $ne: null, $ne: '' } });

    let updated = 0;
    let skipped = 0;

    for (const item of items) {
      if (item.image?.startsWith('http')) {
        const s3Key = await extractS3KeyFromUrl(item.image);
        if (s3Key && !s3Key.startsWith('http')) {
          await MenuItem.updateOne({ _id: item._id }, { image: s3Key });
          logger.info(`[Migration] MenuItem ${item._id}: ${item.image.substring(0, 50)}... → ${s3Key}`);
          updated++;
        } else {
          logger.warn(`[Migration] MenuItem ${item._id}: Could not extract key from ${item.image.substring(0, 50)}...`);
          skipped++;
        }
      }
    }

    logger.info(`[Migration] MenuItem images: ${updated} updated, ${skipped} skipped`);
    return { updated, skipped };
  } catch (error) {
    logger.error('[Migration] MenuItem image migration failed:', error);
    return { updated: 0, skipped: 0 };
  }
}

async function migrateGalleryImages(): Promise<{ updated: number; skipped: number }> {
  logger.info('[Migration] Starting Gallery image migration...');

  try {
    const Gallery = (await import('../models/gallery.js')).default;
    const galleries = await Gallery.find({ image: { $exists: true, $ne: null, $ne: '' } });

    let updated = 0;
    let skipped = 0;

    for (const gallery of galleries) {
      if (gallery.image?.startsWith('http')) {
        const s3Key = await extractS3KeyFromUrl(gallery.image);
        if (s3Key && !s3Key.startsWith('http')) {
          await Gallery.updateOne({ _id: gallery._id }, { image: s3Key });
          logger.info(`[Migration] Gallery ${gallery._id}: Migrated image to S3 key`);
          updated++;
        } else {
          skipped++;
        }
      }
    }

    logger.info(`[Migration] Gallery images: ${updated} updated, ${skipped} skipped`);
    return { updated, skipped };
  } catch (error) {
    logger.error('[Migration] Gallery image migration failed:', error);
    return { updated: 0, skipped: 0 };
  }
}

async function main(): Promise<void> {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/dynleaf';
    await mongoose.connect(mongoUri);
    logger.info('[Migration] ✅ Connected to MongoDB');

    // Run migrations in sequence
    const results = {
      userAvatars: await migrateUserAvatars(),
      brandImages: await migrateBrandImages(),
      outletImages: await migrateOutletImages(),
      menuItemImages: await migrateMenuItemImages(),
      galleryImages: await migrateGalleryImages(),
    };

    // Summary
    const totalUpdated = Object.values(results).reduce((sum, r) => sum + r.updated, 0);
    const totalSkipped = Object.values(results).reduce((sum, r) => sum + r.skipped, 0);

    logger.info('[Migration] ============================================');
    logger.info('[Migration] ✅ MIGRATION COMPLETE!');
    logger.info('[Migration] ============================================');
    logger.info(`[Migration] Total Updated: ${totalUpdated}`);
    logger.info(`[Migration] Total Skipped: ${totalSkipped}`);
    logger.info('[Migration] ============================================');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logger.error('[Migration] ❌ MIGRATION FAILED:', error);
    process.exit(1);
  }
}

// Run migration
main();
