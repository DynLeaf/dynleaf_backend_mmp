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
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf');

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }


        // 1. Outlets collection - location index
        try {
            await db.collection('outlets').createIndex({ location: '2dsphere' });
        } catch (error: any) {
            if (error.code === 85 || error.message.includes('already exists')) {
            } else {
                console.error('   ❌ Error creating outlets.location index:', error.message);
            }
        }

        // 2. FoodItems collection - location index
        try {
            await db.collection('fooditems').createIndex({ location: '2dsphere' });
        } catch (error: any) {
            if (error.code === 85 || error.message.includes('already exists')) {
            } else {
            }
        }

        // 3. Offers collection - location index
        try {
            await db.collection('offers').createIndex({ location: '2dsphere' });
        } catch (error: any) {
            if (error.code === 85 || error.message.includes('already exists')) {
            } else {
                console.error('   ❌ Error creating offers.location index:', error.message);
            }
        }

        // Verify indexes were created

        const outletsIndexes = await db.collection('outlets').indexes();
        const fooditemsIndexes = await db.collection('fooditems').indexes();
        const offersIndexes = await db.collection('offers').indexes();

        // Check if geo indexes exist
        const hasOutletsGeo = outletsIndexes.some(i => i.key?.location === '2dsphere');
        const hasFooditemsGeo = fooditemsIndexes.some(i => i.key?.location === '2dsphere');
        const hasOffersGeo = offersIndexes.some(i => i.key?.location === '2dsphere');





    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
};

// Run the script
createGeoIndexes();
