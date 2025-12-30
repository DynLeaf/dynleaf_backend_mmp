import mongoose from 'mongoose';
import { Outlet } from '../models/Outlet.js';
import { FoodItem } from '../models/FoodItem.js';
import { Category } from '../models/Category.js';
import { Brand } from '../models/Brand.js';

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf';

async function migrate() {
  try {
    console.log('🚀 Starting migration to outlet-centric structure...\n');
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all outlets - don't populate brand, we'll look it up directly
    const outlets = await Outlet.find({}).lean();
    console.log(`📍 Found ${outlets.length} outlets\n`);

    let categoriesMigrated = 0;
    let foodItemsMigrated = 0;
    let categoriesSkipped = 0;
    let foodItemsSkipped = 0;

    // Step 1: Migrate Categories (brand-level to outlet-level)
    console.log('📂 Step 1: Migrating Categories...');
    
    // Get existing brand categories
    const BrandCategory = mongoose.model('Category');
    const brandCategories = await BrandCategory.find({
      brand_id: { $exists: true },
      outlet_id: { $exists: false }
    }).lean();

    console.log(`Found ${brandCategories.length} brand-level categories\n`);

    // Map to store old category ID -> new category ID per outlet
    const categoryMappings = new Map(); // outletId_oldCategoryId -> newCategoryId

    for (const outlet of outlets) {
      const outletId = outlet._id.toString();
      const brandId = outlet.brand_id?.toString();
      
      if (!brandId) continue;

      // Get categories for this brand
      const outletCategories = brandCategories.filter(
        cat => cat.brand_id?.toString() === brandId
      );

      for (const oldCategory of outletCategories) {
        // Check if category already exists for this outlet
        const existing = await Category.findOne({
          outlet_id: outlet._id,
          slug: oldCategory.slug
        });

        if (existing) {
          categoryMappings.set(`${outletId}_${oldCategory._id.toString()}`, existing._id.toString());
          categoriesSkipped++;
          continue;
        }

        // Create new outlet-owned category
        const newCategory = await Category.create({
          outlet_id: outlet._id,
          name: oldCategory.name,
          slug: oldCategory.slug,
          description: oldCategory.description,
          image_url: oldCategory.image_url,
          display_order: oldCategory.display_order || 0,
          is_active: oldCategory.is_active ?? true
        });

        categoryMappings.set(`${outletId}_${oldCategory._id.toString()}`, newCategory._id.toString());
        categoriesMigrated++;
      }
    }

    console.log(`✅ Migrated ${categoriesMigrated} categories`);
    console.log(`⏭️  Skipped ${categoriesSkipped} existing categories\n`);

    // Step 2: Migrate FoodItems
    console.log('🍔 Step 2: Migrating FoodItems...');

    // Get existing brand food items
    const BrandFoodItem = mongoose.model('FoodItem');
    const brandFoodItems = await BrandFoodItem.find({
      brand_id: { $exists: true },
      outlet_id: { $exists: false }
    }).lean();

    console.log(`Found ${brandFoodItems.length} brand-level food items\n`);

    // Check if OutletMenuItem collection exists
    let OutletMenuItem;
    try {
      OutletMenuItem = mongoose.model('OutletMenuItem');
    } catch (error) {
      console.log('⚠️  OutletMenuItem model not found, will clone brand items directly\n');
    }

    for (const outlet of outlets) {
      const outletId = outlet._id.toString();
      const brandId = outlet.brand_id?.toString();
      
      if (!brandId) continue;

      console.log(`\nProcessing outlet: ${outlet.name}...`);

      // Get brand's food items
      const outletBrandItems = brandFoodItems.filter(
        item => item.brand_id?.toString() === brandId
      );

      console.log(`  Found ${outletBrandItems.length} brand items`);

      // Try to get outlet menu items if the collection exists
      let outletMenuItems = [];
      if (OutletMenuItem) {
        outletMenuItems = await OutletMenuItem.find({
          outlet_id: outlet._id
        }).lean();
        console.log(`  Found ${outletMenuItems.length} outlet menu items`);
      }

      let itemsCreated = 0;
      let itemsSkipped = 0;

      for (const brandItem of outletBrandItems) {
        // Check if food item already exists for this outlet
        const existingItem = await FoodItem.findOne({
          outlet_id: outlet._id,
          name: brandItem.name
        });

        if (existingItem) {
          itemsSkipped++;
          continue;
        }

        // Find outlet-specific data if exists
        const outletItemData = outletMenuItems.find(
          omi => omi.food_item_id?.toString() === brandItem._id.toString()
        );

        // Map old category ID to new outlet category ID
        const oldCategoryId = brandItem.category_id?.toString();
        const newCategoryId = oldCategoryId 
          ? categoryMappings.get(`${outletId}_${oldCategoryId}`)
          : undefined;

        // Determine food_type from is_veg
        let foodType: 'veg' | 'non-veg' | 'egg' | 'vegan' = 'veg';
        if (brandItem.is_veg === false) {
          foodType = 'non-veg';
        } else if (brandItem.is_veg === true) {
          foodType = 'veg';
        }

        // Create new outlet-owned food item
        const newFoodItem = await FoodItem.create({
          outlet_id: outlet._id,
          name: brandItem.name,
          description: brandItem.description,
          category_id: newCategoryId ? new mongoose.Types.ObjectId(newCategoryId) : undefined,
          
          // Use outlet-specific price if available, otherwise brand price
          price: outletItemData?.price_override ?? brandItem.base_price ?? brandItem.price,
          
          // Copy all images
          images: brandItem.images || [],
          primary_image: brandItem.primary_image,
          
          // Food type
          food_type: foodType,
          is_veg: brandItem.is_veg,
          
          // Availability
          is_available: outletItemData?.is_available ?? brandItem.is_available ?? true,
          is_active: brandItem.is_active ?? true,
          
          // Copy location from outlet for geospatial queries
          location: outlet.location,
          
          // Stock status
          stock_status: outletItemData?.stock_status || 'in_stock',
          stock_quantity: outletItemData?.stock_quantity,
          
          // Ratings (outlet-specific if available)
          avg_rating: outletItemData?.rating_at_outlet ?? brandItem.avg_rating ?? 0,
          total_votes: outletItemData?.votes_at_outlet ?? brandItem.total_votes ?? 0,
          
          // Order stats
          order_count: outletItemData?.orders_at_outlet ?? 0,
          
          // Features
          is_bestseller: brandItem.is_bestseller || false,
          is_new: brandItem.is_new || false,
          is_featured: outletItemData?.is_featured_at_outlet || false,
          
          // Additional data
          preparation_time: brandItem.preparation_time,
          calories: brandItem.calories,
          serves: brandItem.serves,
          spice_level: brandItem.spice_level,
          
          // Cuisines and ingredients
          cuisines: brandItem.cuisines || [],
          ingredients: brandItem.ingredients || [],
          allergens: brandItem.allergens || [],
          
          // Dietary tags
          dietary_tags: brandItem.dietary_tags || [],
          
          // Save count
          save_count: brandItem.save_count || 0,
          
          // Metadata
          created_at: brandItem.created_at || new Date(),
          updated_at: new Date()
        });

        itemsCreated++;
        foodItemsMigrated++;
      }

      console.log(`  ✅ Created ${itemsCreated} items, skipped ${itemsSkipped} existing`);
      foodItemsSkipped += itemsSkipped;
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`Categories:`);
    console.log(`  ✅ Migrated: ${categoriesMigrated}`);
    console.log(`  ⏭️  Skipped: ${categoriesSkipped}`);
    console.log(`  📈 Total: ${categoriesMigrated + categoriesSkipped}`);
    console.log();
    console.log(`Food Items:`);
    console.log(`  ✅ Migrated: ${foodItemsMigrated}`);
    console.log(`  ⏭️  Skipped: ${foodItemsSkipped}`);
    console.log(`  📈 Total: ${foodItemsMigrated + foodItemsSkipped}`);
    console.log('='.repeat(60));
    
    console.log('\n✅ Migration completed successfully!\n');
    console.log('📋 Next Steps:');
    console.log('1. Verify the data in MongoDB');
    console.log('2. Test the APIs (menu, search, outlet detail)');
    console.log('3. If everything works, you can drop old collections:');
    console.log('   - db.outletmenuitems.drop()');
    console.log('   - Old brand-level categories/food items (if separate)');
    console.log('4. Clear Redis cache if you\'re using it');
    console.log('5. Monitor logs for any issues\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('✨ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
