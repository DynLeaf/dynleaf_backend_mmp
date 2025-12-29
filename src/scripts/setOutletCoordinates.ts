/**
 * Script to manually set coordinates for outlets
 * Edit the outlets array below with the correct coordinates
 * Run with: npm run set-coordinates
 */

import mongoose from 'mongoose';
import { Outlet } from '../models/Outlet.js';
import dotenv from 'dotenv';

dotenv.config();

// Define outlet coordinates here
// You can get coordinates from Google Maps or use the LocationSearch component
const OUTLET_COORDINATES = [
    {
        name: 'KFC - Kozhikode',
        // Wayanad Road, Mananchira, Kozhikode, Kerala
        latitude: 11.2588,
        longitude: 75.7804
    },
    {
        name: 'Lofisto - Main',
        // Add coordinates
        latitude: 11.2588, // Replace with actual
        longitude: 75.7804  // Replace with actual
    },
    {
        name: 'Sign Laban - Kozhikode',
        // Add coordinates
        latitude: 11.2588, // Replace with actual
        longitude: 75.7804  // Replace with actual
    },
    {
        name: 'Lofisto - Kozhikode',
        // Wayanad Road, Mananchira, Kozhikode
        latitude: 11.2588,
        longitude: 75.7804
    },
    {
        name: 'White House - Kozhikode',
        // Vellayil, Kozhikode
        latitude: 11.2480,  // Approximate for Vellayil area
        longitude: 75.7860
    },
    {
        name: 'White House - Bayan Nurun',
        // Bayan Nurun, Inner Mongolia, China (This seems wrong, should be in India?)
        latitude: 42.2838,  // This is in China
        longitude: 119.6372
    }
];

async function setOutletCoordinates() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dynleaf';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        let updated = 0;
        let notFound = 0;
        let errors = 0;

        for (const outletData of OUTLET_COORDINATES) {
            try {
                console.log(`🔍 Finding outlet: ${outletData.name}`);
                
                const outlet = await Outlet.findOne({ name: outletData.name });
                
                if (!outlet) {
                    console.log(`❌ Outlet "${outletData.name}" not found\n`);
                    notFound++;
                    continue;
                }

                // Update location with GeoJSON format
                outlet.location = {
                    type: 'Point',
                    coordinates: [outletData.longitude, outletData.latitude]  // [lng, lat]
                };

                await outlet.save();
                
                console.log(`✅ Updated "${outletData.name}"`);
                console.log(`   Coordinates: [${outletData.longitude}, ${outletData.latitude}]`);
                console.log(`   Address: ${outlet.address?.city}, ${outlet.address?.state}\n`);
                
                updated++;
            } catch (err: any) {
                console.error(`❌ Error updating "${outletData.name}":`, err.message, '\n');
                errors++;
            }
        }

        console.log('📈 Summary:');
        console.log(`✅ Updated: ${updated}`);
        console.log(`❌ Not found: ${notFound}`);
        console.log(`⚠️  Errors: ${errors}`);

        // Verify by finding nearby outlets
        if (updated > 0) {
            console.log('\n🧪 Testing nearby search (Kozhikode center):');
            const nearbyOutlets = await Outlet.aggregate([
                {
                    $geoNear: {
                        near: {
                            type: 'Point',
                            coordinates: [75.7804, 11.2588]  // Kozhikode center
                        },
                        distanceField: 'distance',
                        maxDistance: 50000,  // 50km
                        spherical: true
                    }
                },
                {
                    $project: {
                        name: 1,
                        distance: { $round: ['$distance', 0] },
                        'address.city': 1
                    }
                }
            ]);

            console.log(`Found ${nearbyOutlets.length} outlets within 50km:`);
            nearbyOutlets.forEach((outlet: any) => {
                console.log(`  - ${outlet.name}: ${(outlet.distance / 1000).toFixed(1)}km away`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
        process.exit(0);
    }
}

setOutletCoordinates();
