import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Script to create geospatial indexes in production database
 * Run this script to fix the missing geo-index errors
 */

const createGeoIndexes = async () => {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf');
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }

        console.log('\n📊 Creating geospatial indexes...\n');

        // 1. Outlets collection - location index
        console.log('1️⃣  Creating index for outlets.location...');
        try {
            await db.collection('outlets').createIndex({ location: '2dsphere' });
            console.log('   ✅ outlets.location index created');
        } catch (error: any) {
            if (error.code === 85 || error.message.includes('already exists')) {
                console.log('   ℹ️  outlets.location index already exists');
            } else {
                console.error('   ❌ Error creating outlets.location index:', error.message);
            }
        }

        // 2. FoodItems collection - location index
        console.log('\n2️⃣  Creating index for fooditems.location...');
        try {
            await db.collection('fooditems').createIndex({ location: '2dsphere' });
            console.log('   ✅ fooditems.location index created');
        } catch (error: any) {
            if (error.code === 85 || error.message.includes('already exists')) {
                console.log('   ℹ️  fooditems.location index already exists');
            } else {
                console.error('   ❌ Error creating fooditems.location index:', error.message);
            }
        }

        // 3. Offers collection - location index
        console.log('\n3️⃣  Creating index for offers.location...');
        try {
            await db.collection('offers').createIndex({ location: '2dsphere' });
            console.log('   ✅ offers.location index created');
        } catch (error: any) {
            if (error.code === 85 || error.message.includes('already exists')) {
                console.log('   ℹ️  offers.location index already exists');
            } else {
                console.error('   ❌ Error creating offers.location index:', error.message);
            }
        }

        // Verify indexes were created
        console.log('\n🔍 Verifying indexes...\n');

        const outletsIndexes = await db.collection('outlets').indexes();
        const fooditemsIndexes = await db.collection('fooditems').indexes();
        const offersIndexes = await db.collection('offers').indexes();

        console.log('Outlets indexes:', outletsIndexes.map(i => i.name).join(', '));
        console.log('FoodItems indexes:', fooditemsIndexes.map(i => i.name).join(', '));
        console.log('Offers indexes:', offersIndexes.map(i => i.name).join(', '));

        // Check if geo indexes exist
        const hasOutletsGeo = outletsIndexes.some(i => i.key?.location === '2dsphere');
        const hasFooditemsGeo = fooditemsIndexes.some(i => i.key?.location === '2dsphere');
        const hasOffersGeo = offersIndexes.some(i => i.key?.location === '2dsphere');

        console.log('\n📋 Geo-index Status:');
        console.log(`   Outlets:   ${hasOutletsGeo ? '✅' : '❌'}`);
        console.log(`   FoodItems: ${hasFooditemsGeo ? '✅' : '❌'}`);
        console.log(`   Offers:    ${hasOffersGeo ? '✅' : '❌'}`);

        if (hasOutletsGeo && hasFooditemsGeo && hasOffersGeo) {
            console.log('\n🎉 All geo-indexes are in place!');
        } else {
            console.log('\n⚠️  Some geo-indexes are still missing. Please check the errors above.');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Disconnected from MongoDB');
        process.exit(0);
    }
};

// Run the script
console.log('🚀 Starting geo-index creation script...\n');
createGeoIndexes();
