import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Import models after dotenv
import { Outlet } from '../models/Outlet.js';
import '../models/Brand.js'; // Import to register the model

async function diagnoseOutlets() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('✅ Connected to MongoDB\n');

    const searchLat = 11.246930904158326;
    const searchLng = 75.78283309936525;

    // Get all outlets with their brands
    const outlets = await Outlet.find({})
      .populate('brand_id')
      .lean();

    console.log(`📊 Total outlets in database: ${outlets.length}\n`);
    console.log('=' .repeat(80));

    // Calculate distance for each
    for (const outlet of outlets) {
      const brand = outlet.brand_id as any;
      
      // Calculate distance
      const [lng, lat] = outlet.location?.coordinates || [0, 0];
      const distance = calculateDistance(searchLat, searchLng, lat, lng);
      
      const withinRadius = distance <= 50000;
      const outletActive = outlet.status === 'ACTIVE';
      const outletApproved = outlet.approval_status === 'APPROVED';
      const brandExists = !!brand;
      const brandApproved = brand?.verification_status === 'approved';
      const brandActive = brand?.is_active === true;
      
      const shouldAppear = withinRadius && outletActive && outletApproved && brandExists && brandApproved && brandActive;
      
      console.log(`\n🏪 ${outlet.name}`);
      console.log(`   Outlet Status: ${outlet.status} ${outletActive ? '✅' : '❌'}`);
      console.log(`   Outlet Approval: ${outlet.approval_status} ${outletApproved ? '✅' : '❌'}`);
      console.log(`   Distance: ${Math.round(distance)}m (${(distance/1000).toFixed(1)}km) ${withinRadius ? '✅' : '❌ TOO FAR'}`);
      console.log(`   Coordinates: [${lng}, ${lat}]`);
      console.log(`   `);
      console.log(`   📦 Brand: ${brand?.name || 'N/A'}`);
      console.log(`   Brand Active: ${brand?.is_active} ${brandActive ? '✅' : '❌'}`);
      console.log(`   Brand Verification: ${brand?.verification_status || 'N/A'} ${brandApproved ? '✅' : '❌'}`);
      console.log(`   `);
      console.log(`   ${shouldAppear ? '✅ WILL APPEAR IN API' : '❌ WILL NOT APPEAR IN API'}`);
      
      if (!shouldAppear) {
        console.log(`   Reason: ${!withinRadius ? 'Too far' : !outletActive ? 'Outlet not active' : !outletApproved ? 'Outlet not approved' : !brandExists ? 'No brand' : !brandApproved ? 'Brand not approved' : !brandActive ? 'Brand not active' : 'Unknown'}`);
      }
      console.log('   ' + '-'.repeat(76));
    }

    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    
    const validOutlets = outlets.filter(o => {
      const brand = o.brand_id as any;
      const [lng, lat] = o.location?.coordinates || [0, 0];
      const distance = calculateDistance(searchLat, searchLng, lat, lng);
      return distance <= 50000 && 
             o.status === 'ACTIVE' && 
             o.approval_status === 'APPROVED' &&
             brand &&
             brand.verification_status === 'approved' &&
             brand.is_active === true;
    });
    
    console.log(`Total outlets: ${outlets.length}`);
    console.log(`Valid outlets (should appear in API): ${validOutlets.length}`);
    console.log(`\nValid outlets:`);
    validOutlets.forEach(o => {
      const brand = o.brand_id as any;
      const [lng, lat] = o.location?.coordinates || [0, 0];
      const distance = calculateDistance(searchLat, searchLng, lat, lng);
      console.log(`  - ${o.name} (${brand?.name}) - ${Math.round(distance)}m`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

diagnoseOutlets();
