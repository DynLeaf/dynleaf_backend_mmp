import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Outlet } from '../models/Outlet.js';
import { Brand } from '../models/Brand.js';

dotenv.config();

async function verifyOutletData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('✅ Connected to MongoDB');

        // Check all outlets
        const outlets = await Outlet.find({}).lean();
        console.log(`\n📊 Total outlets: ${outlets.length}`);

        // Check active outlets
        const activeOutlets = outlets.filter(o => o.status === 'ACTIVE' && o.approval_status === 'APPROVED');
        console.log(`✅ Active & Approved outlets: ${activeOutlets.length}`);

        // Check outlets with coordinates
        const outletsWithCoords = outlets.filter(o => 
            o.location?.coordinates && 
            Array.isArray(o.location.coordinates) && 
            o.location.coordinates.length === 2
        );
        console.log(`📍 Outlets with coordinates: ${outletsWithCoords.length}`);

        // Get all brands
        const brands = await Brand.find({}).lean();
        const brandMap = new Map(brands.map(b => [b._id.toString(), b]));

        // List all outlets with details
        console.log('\n📋 Outlet Details:');
        for (const outlet of outlets) {
            const brand = brandMap.get(outlet.brand_id.toString());
            const hasCoords = outlet.location?.coordinates?.length === 2;
            const coords = hasCoords ? outlet.location.coordinates : 'NO COORDS';
            
            console.log(`
  ${outlet.name}
  - Status: ${outlet.status} / ${outlet.approval_status}
  - Brand: ${brand?.name || 'N/A'} (${brand?.verification_status || 'N/A'})
  - Coordinates: ${coords}
  - City: ${outlet.address?.city || 'N/A'}
            `);
        }

        // Check indexes
        const indexes = await Outlet.collection.getIndexes();
        console.log('\n🔍 Outlet Collection Indexes:');
        console.log(JSON.stringify(indexes, null, 2));

        // Test a sample query
        const testLat = 11.253932;
        const testLng = 75.811157;
        const testRadius = 50000;

        console.log(`\n🧪 Testing query near (${testLat}, ${testLng}) within ${testRadius}m`);
        
        const testOutlets = await Outlet.find({
            status: 'ACTIVE',
            approval_status: 'APPROVED',
            'location.coordinates': { $exists: true, $ne: [] }
        }).lean();

        console.log(`Found ${testOutlets.length} active outlets with coordinates`);

        // Calculate distances manually
        for (const outlet of testOutlets) {
            if (outlet.location?.coordinates?.length === 2) {
                const [lng, lat] = outlet.location.coordinates;
                const distance = calculateDistance(testLat, testLng, lat, lng);
                const brand = brandMap.get(outlet.brand_id.toString());
                console.log(`  - ${outlet.name}: ${Math.round(distance)}m (Brand: ${brand?.name}, Status: ${brand?.verification_status})`);
            }
        }

        await mongoose.disconnect();
        console.log('\n✅ Verification complete');
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

verifyOutletData();
