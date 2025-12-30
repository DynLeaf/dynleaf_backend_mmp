import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import { Brand } from '../models/Brand.js';
import { Outlet } from '../models/Outlet.js';

async function checkBrandStatus() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('✅ Connected\n');

    const kfc = await Brand.findOne({ name: 'KFC' });
    const lofisto = await Brand.findOne({ name: 'Lofisto' });
    
    console.log('KFC Brand:');
    console.log(`  is_active: ${kfc?.is_active}`);
    console.log(`  verification_status: ${kfc?.verification_status}`);
    console.log();
    
    console.log('Lofisto Brand:');
    console.log(`  is_active: ${lofisto?.is_active}`);
    console.log(`  verification_status: ${lofisto?.verification_status}`);
    console.log();
    
    // Check outlets
    const kfcOutlet = await Outlet.findOne({ name: 'KFC - Kozhikode' });
    const lofistoOutlet = await Outlet.findOne({ name: 'Lofisto - Kozhikode' });
    
    console.log('KFC Outlet:');
    console.log(`  status: ${kfcOutlet?.status}`);
    console.log(`  approval_status: ${kfcOutlet?.approval_status}`);
    console.log();
    
    console.log('Lofisto Outlet:');
    console.log(`  status: ${lofistoOutlet?.status}`);
    console.log(`  approval_status: ${lofistoOutlet?.approval_status}`);
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkBrandStatus();
