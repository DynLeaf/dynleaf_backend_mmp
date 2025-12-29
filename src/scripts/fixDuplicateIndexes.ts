import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || '';

async function fixDuplicateIndexes() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }

        // Get the outlets collection
        const collection = db.collection('outlets');

        // List all indexes
        console.log('📋 Current indexes on outlets collection:');
        const indexes = await collection.indexes();
        indexes.forEach((index, i) => {
            console.log(`${i + 1}. ${index.name}:`, JSON.stringify(index.key));
        });

        // Find all 2dsphere indexes
        const geoIndexes = indexes.filter(idx => {
            return Object.values(idx.key).includes('2dsphere');
        });

        console.log(`\n🔍 Found ${geoIndexes.length} 2dsphere index(es)`);

        if (geoIndexes.length > 1) {
            console.log('\n⚠️  Multiple 2dsphere indexes detected. Dropping all except the primary one...\n');

            // Keep only the 'location_2dsphere' index, drop others
            for (const index of geoIndexes) {
                if (index.name !== 'location_2dsphere') {
                    console.log(`🗑️  Dropping index: ${index.name}`);
                    await collection.dropIndex(index.name);
                    console.log(`✅ Dropped: ${index.name}`);
                }
            }

            // Ensure the correct index exists
            console.log('\n🔨 Ensuring correct location index exists...');
            try {
                await collection.createIndex({ location: '2dsphere' }, { name: 'location_2dsphere' });
                console.log('✅ Location 2dsphere index created/verified');
            } catch (error: any) {
                if (error.code === 85 || error.message.includes('already exists')) {
                    console.log('ℹ️  Location index already exists (as expected)');
                } else {
                    throw error;
                }
            }
        } else if (geoIndexes.length === 1) {
            console.log('✅ Only one 2dsphere index found. No duplicates to remove.');
        } else {
            console.log('⚠️  No 2dsphere index found. Creating one...');
            await collection.createIndex({ location: '2dsphere' }, { name: 'location_2dsphere' });
            console.log('✅ Location 2dsphere index created');
        }

        // List final indexes
        console.log('\n📋 Final indexes on outlets collection:');
        const finalIndexes = await collection.indexes();
        finalIndexes.forEach((index, i) => {
            console.log(`${i + 1}. ${index.name}:`, JSON.stringify(index.key));
        });

        console.log('\n✅ Index cleanup complete!');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

fixDuplicateIndexes();
