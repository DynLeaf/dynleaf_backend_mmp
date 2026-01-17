import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Outlet } from '../models/Outlet.js';
import { FoodItem } from '../models/FoodItem.js';
import { Offer } from '../models/Offer.js';

dotenv.config();

/**
 * Script to create dummy documents so geo-indexes can be created
 * This is needed because MongoDB can't create indexes on non-existent collections
 */

const seedDummyData = async () => {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf');
        console.log('✅ Connected to MongoDB');

        // Check if collections exist
        const outletsCount = await Outlet.countDocuments();
        const foodItemsCount = await FoodItem.countDocuments();
        const offersCount = await Offer.countDocuments();

        console.log('\n📊 Current document counts:');
        console.log(`   Outlets: ${outletsCount}`);
        console.log(`   FoodItems: ${foodItemsCount}`);
        console.log(`   Offers: ${offersCount}`);

        // Create dummy outlet if none exist
        if (outletsCount === 0) {
            console.log('\n📍 Creating dummy outlet...');
            await Outlet.create({
                name: 'Dummy Outlet (Delete Me)',
                slug: 'dummy-outlet-delete-me',
                brand_id: new mongoose.Types.ObjectId(),
                created_by_user_id: new mongoose.Types.ObjectId(),
                status: 'DRAFT',
                approval_status: 'PENDING',
                location: {
                    type: 'Point',
                    coordinates: [75.8577, 11.2588] // Kozhikode coordinates
                }
            });
            console.log('   ✅ Dummy outlet created');
        } else {
            console.log('\n   ℹ️  Outlets collection already has data');
        }

        // Create dummy food item if none exist
        if (foodItemsCount === 0) {
            console.log('\n🍕 Creating dummy food item...');
            await FoodItem.create({
                name: 'Dummy Food Item (Delete Me)',
                outlet_id: new mongoose.Types.ObjectId(),
                item_type: 'food',
                food_type: 'veg',
                price: 100,
                location: {
                    type: 'Point',
                    coordinates: [75.8577, 11.2588]
                }
            });
            console.log('   ✅ Dummy food item created');
        } else {
            console.log('\n   ℹ️  FoodItems collection already has data');
        }

        // Create dummy offer if none exist
        if (offersCount === 0) {
            console.log('\n🎁 Creating dummy offer...');
            await Offer.create({
                title: 'Dummy Offer (Delete Me)',
                created_by_user_id: new mongoose.Types.ObjectId(),
                location: {
                    type: 'Point',
                    coordinates: [75.8577, 11.2588]
                }
            });
            console.log('   ✅ Dummy offer created');
        } else {
            console.log('\n   ℹ️  Offers collection already has data');
        }

        console.log('\n✅ Done! Now the geo-indexes can be created.');
        console.log('💡 Restart your server to create the indexes.');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Disconnected from MongoDB');
        process.exit(0);
    }
};

seedDummyData();
