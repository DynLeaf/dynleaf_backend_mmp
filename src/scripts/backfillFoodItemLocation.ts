import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodItem } from '../models/FoodItem.js';
import { Outlet } from '../models/Outlet.js';
import connectDB from '../config/db.js';

const backfill = async () => {
    try {
        console.log('Starting migration...');

        // Connect to Database
        await connectDB();
        console.log('Connected to DB');

        // Find items without valid location
        // We look for items where location field is missing OR coordinates array is empty
        const items = await FoodItem.find({
            $or: [
                { location: { $exists: false } },
                { 'location.coordinates': { $exists: false } },
                { 'location.coordinates': { $size: 0 } }
            ]
        });

        console.log(`Found ${items.length} food items needing location backfill.`);

        let success = 0;
        let fail = 0;
        let skipped = 0;

        // Cache outlets to reduce DB calls
        const outletCache = new Map();

        // Process in chunks or one by one
        for (const item of items) {
            const outletId = item.outlet_id ? item.outlet_id.toString() : null;

            if (!outletId) {
                console.warn(`Item ${item._id} has no outlet_id. Skipping.`);
                skipped++;
                continue;
            }

            let outlet = outletCache.get(outletId);

            if (!outlet) {
                outlet = await Outlet.findById(outletId);
                if (outlet) {
                    outletCache.set(outletId, outlet);
                }
            }

            if (outlet && outlet.location && outlet.location.coordinates && outlet.location.coordinates.length === 2) {
                // Check for 0,0 generic coordinates and skip/warn if strict? 
                // But for now we blindly copy outlet location as it is better than nothing.

                item.location = {
                    type: 'Point',
                    coordinates: outlet.location.coordinates
                };

                await item.save();
                success++;

                if (success % 100 === 0) process.stdout.write('.');
            } else {
                // Outlet itself might likely store location
                // If outlet has no location, we can't backfill
                fail++;
                // console.warn(`Outlet ${outletId} missing location. Cannot backfill item ${item._id}`);
            }
        }

        console.log('\n');
        console.log('Migration Complete');
        console.log(`Updated: ${success}`);
        console.log(`Failed (Outlet missing loc): ${fail}`);
        console.log(`Skipped (No outlet_id): ${skipped}`);

        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

backfill();
