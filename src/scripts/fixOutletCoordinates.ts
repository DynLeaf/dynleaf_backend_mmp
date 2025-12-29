/**
 * Script to fix outlet locations - ensures all outlets have proper GeoJSON coordinates
 * Run this once to fix existing data: npm run fix-coordinates
 */

import mongoose from 'mongoose';
import { Outlet } from '../models/Outlet.js';
import dotenv from 'dotenv';

dotenv.config();

async function fixOutletCoordinates() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Find all outlets
        const outlets = await Outlet.find({});
        console.log(`📊 Found ${outlets.length} outlets to check`);

        let fixed = 0;
        let alreadyOk = 0;
        let needsManualFix = 0;

        for (const outlet of outlets) {
            // Check if location exists and has coordinates
            if (!outlet.location || !outlet.location.coordinates || outlet.location.coordinates.length === 0) {
                console.log(`⚠️  Outlet "${outlet.name}" (${outlet._id}) has no coordinates`);
                needsManualFix++;
                continue;
            }

            // Check if coordinates are valid
            const [lng, lat] = outlet.location.coordinates;
            
            if (typeof lng !== 'number' || typeof lat !== 'number') {
                console.log(`❌ Outlet "${outlet.name}" (${outlet._id}) has invalid coordinates:`, outlet.location.coordinates);
                needsManualFix++;
                continue;
            }

            // Check if coordinates are in valid range
            if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
                console.log(`❌ Outlet "${outlet.name}" (${outlet._id}) has out-of-range coordinates: [${lng}, ${lat}]`);
                needsManualFix++;
                continue;
            }

            // Ensure type is set to 'Point'
            if (outlet.location.type !== 'Point') {
                outlet.location.type = 'Point';
                await outlet.save();
                console.log(`🔧 Fixed location type for "${outlet.name}"`);
                fixed++;
            } else {
                console.log(`✅ Outlet "${outlet.name}" coordinates OK: [${lng.toFixed(6)}, ${lat.toFixed(6)}]`);
                alreadyOk++;
            }
        }

        console.log('\n📈 Summary:');
        console.log(`✅ Already correct: ${alreadyOk}`);
        console.log(`🔧 Fixed: ${fixed}`);
        console.log(`⚠️  Needs manual fix: ${needsManualFix}`);

        // Create 2dsphere index if it doesn't exist
        try {
            await Outlet.collection.createIndex({ location: '2dsphere' });
            console.log('\n✅ Ensured 2dsphere index exists on location field');
        } catch (err) {
            console.log('ℹ️  Index might already exist');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run the script
fixOutletCoordinates();
