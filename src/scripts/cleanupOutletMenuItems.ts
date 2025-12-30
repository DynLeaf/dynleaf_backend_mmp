import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { OutletMenuItem } from '../models/OutletMenuItem.js';

dotenv.config();

const cleanupOutletMenuItems = async () => {
  try {
    console.log('🧹 Starting cleanup...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('✅ Connected to MongoDB\n');

    // Count existing records
    const count = await OutletMenuItem.countDocuments();
    console.log(`📊 Found ${count} OutletMenuItem records\n`);

    if (count === 0) {
      console.log('✅ Collection is already empty');
      await mongoose.disconnect();
      return;
    }

    // Confirm deletion
    console.log('⚠️  This will delete all OutletMenuItem records');
    
    // Delete all records
    const result = await OutletMenuItem.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} OutletMenuItem records\n`);

    console.log('🎉 Cleanup completed successfully!');
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
};

cleanupOutletMenuItems();
