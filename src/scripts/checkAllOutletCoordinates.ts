import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Outlet } from '../models/Outlet.js';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

async function checkAllOutlets() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Fetch all outlets with their coordinates
        const outlets = await Outlet.find({}, {
            name: 1,
            'address.city': 1,
            'address.state': 1,
            'location.type': 1,
            'location.coordinates': 1,
            status: 1
        }).lean();

        console.log(`📊 Found ${outlets.length} outlets:\n`);

        outlets.forEach((outlet, index) => {
            const coords = outlet.location?.coordinates;
            const hasCoords = coords && coords.length === 2 && coords[0] !== 0 && coords[1] !== 0;
            
            console.log(`${index + 1}. ${outlet.name}`);
            console.log(`   Status: ${outlet.status}`);
            console.log(`   City: ${outlet.address?.city || 'N/A'}, State: ${outlet.address?.state || 'N/A'}`);
            console.log(`   Location Type: ${outlet.location?.type || 'N/A'}`);
            console.log(`   Coordinates: ${hasCoords ? `[${coords[0]}, ${coords[1]}]` : '❌ MISSING or EMPTY'}`);
            
            if (hasCoords) {
                const lng = coords[0];
                const lat = coords[1];
                
                // Check if coordinates are in valid range
                if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
                    console.log(`   ⚠️  INVALID RANGE`);
                } else {
                    console.log(`   ✅ Valid`);
                }
                
                // Calculate distance from Kozhikode (11.2588, 75.7804)
                const kozhikodeLat = 11.2588;
                const kozhikodeLng = 75.7804;
                
                // Simple distance calculation (not accurate but good enough for debugging)
                const latDiff = Math.abs(lat - kozhikodeLat);
                const lngDiff = Math.abs(lng - kozhikodeLng);
                const roughDistance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111; // km
                
                console.log(`   📏 ~${roughDistance.toFixed(1)} km from Kozhikode center`);
            }
            console.log('');
        });

        // Test nearby query
        console.log('\n🧪 Testing $geoNear aggregation from Kozhikode (11.2588, 75.7804):\n');
        
        const nearbyOutlets = await Outlet.aggregate([
            {
                $geoNear: {
                    near: {
                        type: 'Point',
                        coordinates: [75.7804, 11.2588] // [lng, lat]
                    },
                    distanceField: 'distance',
                    maxDistance: 50000, // 50 km
                    spherical: true,
                    query: { status: { $in: ['ACTIVE', 'DRAFT'] } }
                }
            },
            {
                $project: {
                    name: 1,
                    'address.city': 1,
                    'location.coordinates': 1,
                    distance: 1
                }
            }
        ]);

        console.log(`Found ${nearbyOutlets.length} outlets within 50km:`);
        nearbyOutlets.forEach((outlet, index) => {
            console.log(`${index + 1}. ${outlet.name} - ${(outlet.distance / 1000).toFixed(2)} km`);
            console.log(`   Coordinates: [${outlet.location.coordinates[0]}, ${outlet.location.coordinates[1]}]`);
        });

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

checkAllOutlets();
