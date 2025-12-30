import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import { Brand } from '../models/Brand.js';

async function fixBrands() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('✅ Connected to MongoDB\n');

    // Update ALL brands to set is_active = true
    const result = await Brand.updateMany(
      {},
      { $set: { is_active: true } }
    );
    
    console.log(`📊 Matched: ${result.matchedCount} brands`);
    console.log(`🔧 Modified: ${result.modifiedCount} brands\n`);

    // Verify
    const brands = await Brand.find({});
    console.log('Verification:');
    for (const brand of brands) {
      console.log(`  ${brand.name}: is_active = ${brand.is_active} ${brand.is_active ? '✅' : '❌'}`);
    }

    console.log(`\n✅ All brands updated`);
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixBrands();
