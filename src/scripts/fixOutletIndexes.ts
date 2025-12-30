import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const fixOutletIndexes = async () => {
  try {
    console.log('🔧 Starting index cleanup...\n');

    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collection = db?.collection('outlets');

    if (!collection) {
      throw new Error('Could not access outlets collection');
    }

    // Get all existing indexes
    const indexes = await collection.indexes();
    console.log('📋 Current indexes on outlets collection:');
    indexes.forEach((index, i) => {
      console.log(`${i + 1}. ${index.name}: ${JSON.stringify(index.key)}`);
    });

    console.log('\n🗑️  Dropping all indexes except _id...');
    
    // Drop all indexes except _id
    for (const index of indexes) {
      if (index.name !== '_id_') {
        try {
          await collection.dropIndex(index.name);
          console.log(`   ✅ Dropped: ${index.name}`);
        } catch (error: any) {
          console.log(`   ⚠️  Could not drop ${index.name}: ${error.message}`);
        }
      }
    }

    console.log('\n✨ Creating new optimized indexes...');

    // Create single 2dsphere index on location
    await collection.createIndex({ location: '2dsphere' });
    console.log('   ✅ Created: location (2dsphere)');

    // Create other necessary indexes
    await collection.createIndex({ slug: 1 }, { unique: true });
    console.log('   ✅ Created: slug (unique)');

    await collection.createIndex({ brand_id: 1 });
    console.log('   ✅ Created: brand_id');

    await collection.createIndex({ status: 1, approval_status: 1 });
    console.log('   ✅ Created: status + approval_status');

    await collection.createIndex({ 'flags.is_featured': 1 });
    console.log('   ✅ Created: flags.is_featured');

    await collection.createIndex({ created_by_user_id: 1 });
    console.log('   ✅ Created: created_by_user_id');

    await collection.createIndex({ 'address.city': 1, 'address.state': 1 });
    console.log('   ✅ Created: address.city + address.state');

    // Verify new indexes
    console.log('\n📋 Final indexes:');
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach((index, i) => {
      console.log(`${i + 1}. ${index.name}: ${JSON.stringify(index.key)}`);
    });

    console.log('\n🎉 Index cleanup completed successfully!');
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error during index cleanup:', error);
    process.exit(1);
  }
};

fixOutletIndexes();
