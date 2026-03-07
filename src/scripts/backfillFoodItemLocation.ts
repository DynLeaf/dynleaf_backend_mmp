import 'dotenv/config';
import { FoodItem } from '../models/FoodItem.js';
import { Outlet } from '../models/Outlet.js';
import connectDB from '../config/db.js';

const backfill = async () => {
    try {

        // Connect to Database
        await connectDB();

        // Find items without valid location
        const items = await FoodItem.find({
            $or: [
                { location: { $exists: false } },
                { 'location.coordinates': { $exists: false } },
                { 'location.coordinates': { $size: 0 } }
            ]
        });


        let success = 0;
        let fail = 0;
        let skipped = 0;

        // Cache outlets to reduce DB calls
        const outletCache = new Map();

        for (const item of items) {
            const outletId = item.outlet_id?.toString();

            if (!outletId) {
                console.warn(`FoodItem ${item._id} has no outlet_id. Skipping.`);
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
                item.location = {
                    type: 'Point',
                    coordinates: outlet.location.coordinates
                };

                await item.save();
                success++;

                if (success % 10 === 0) process.stdout.write('.');
            } else {
                fail++;
                console.warn(`Outlet ${outletId} missing location. Cannot backfill item ${item._id}`);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Backfill failed:', error);
        process.exit(1);
    }
};

backfill();
