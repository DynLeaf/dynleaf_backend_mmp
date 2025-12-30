import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Outlet } from '../models/Outlet.js';
import { FoodItem } from '../models/FoodItem.js';
import { OutletMenuItem } from '../models/OutletMenuItem.js';

dotenv.config();

/**
 * Migration Script: Create OutletMenuItem records
 * 
 * Purpose: Migrate from brand-level menus to outlet-level menus
 * 
 * Strategy:
 * 1. For each outlet
 * 2. Get all food items for that outlet's brand
 * 3. Create OutletMenuItem record for each food item
 * 4. Copy outlet coordinates to OutletMenuItem for geospatial queries
 * 5. Set default values (is_available: true, price from base_price)
 */

async function migrateToOutletMenuItems() {
  try {
    console.log('🚀 Starting migration...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('✅ Connected to MongoDB\n');

    // Get all outlets
    const outlets = await Outlet.find({
      status: { $in: ['ACTIVE', 'INACTIVE', 'DRAFT'] }
    }).select('_id name brand_id location');
    
    console.log(`📊 Found ${outlets.length} outlets to process\n`);

    let totalCreated = 0;
    let totalSkipped = 0;
    let outletsWithNoItems = 0;

    for (const outlet of outlets) {
      console.log(`\n🏪 Processing: ${outlet.name} (${outlet._id})`);
      console.log(`   Brand ID: ${outlet.brand_id}`);

      // Check if outlet has coordinates
      if (!outlet.location?.coordinates || outlet.location.coordinates.length !== 2) {
        console.log(`   ⚠️  WARNING: Outlet has no coordinates, skipping...`);
        outletsWithNoItems++;
        continue;
      }

      const [lng, lat] = outlet.location.coordinates;
      console.log(`   📍 Location: [${lng}, ${lat}]`);

      // Get all food items for this brand
      const foodItems = await FoodItem.find({
        brand_id: outlet.brand_id,
        is_active: true
      }).select('_id name base_price order');

      console.log(`   📋 Found ${foodItems.length} food items for brand`);

      if (foodItems.length === 0) {
        outletsWithNoItems++;
        continue;
      }

      // Create OutletMenuItem records
      let created = 0;
      let skipped = 0;

      for (const foodItem of foodItems) {
        // Check if already exists
        const existing = await OutletMenuItem.findOne({
          outlet_id: outlet._id,
          food_item_id: foodItem._id
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Create new OutletMenuItem
        await OutletMenuItem.create({
          outlet_id: outlet._id,
          food_item_id: foodItem._id,
          brand_id: outlet.brand_id,
          
          // Default availability
          is_available: true,
          stock_status: 'in_stock',
          daily_sold: 0,
          
          // No price override (will use base_price)
          price_override: null,
          discount_override: null,
          
          // Menu organization
          display_order: foodItem.order || 0,
          is_featured_at_outlet: false,
          
          // Copy location from outlet for geospatial queries
          location: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          
          // Engagement metrics (start at 0)
          votes_at_outlet: 0,
          rating_at_outlet: 0,
          orders_at_outlet: 0,
          views_at_outlet: 0
        });

        created++;
      }

      console.log(`   ✅ Created: ${created} new menu items`);
      if (skipped > 0) {
        console.log(`   ⏭️  Skipped: ${skipped} existing menu items`);
      }

      totalCreated += created;
      totalSkipped += skipped;
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total outlets processed: ${outlets.length}`);
    console.log(`Outlets with no items: ${outletsWithNoItems}`);
    console.log(`Total menu items created: ${totalCreated}`);
    console.log(`Total menu items skipped: ${totalSkipped}`);
    console.log('='.repeat(60));

    // Verify indexes
    console.log('\n🔍 Verifying indexes...');
    const indexes = await OutletMenuItem.collection.getIndexes();
    console.log('Indexes on OutletMenuItem collection:');
    Object.keys(indexes).forEach(indexName => {
      console.log(`  - ${indexName}: ${JSON.stringify(indexes[indexName])}`);
    });

    // Test geospatial query
    console.log('\n🧪 Testing geospatial query...');
    const testLat = 11.253932;
    const testLng = 75.811157;
    const testRadius = 50000; // 50km

    const nearbyItems = await OutletMenuItem.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [testLng, testLat]
          },
          $maxDistance: testRadius
        }
      },
      is_available: true
    }).limit(5);

    console.log(`Found ${nearbyItems.length} items within ${testRadius/1000}km of test location`);

    console.log('\n✅ Migration completed successfully!');
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration
migrateToOutletMenuItems();
