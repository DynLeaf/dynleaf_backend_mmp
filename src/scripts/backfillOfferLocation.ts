import 'dotenv/config';
import mongoose from 'mongoose';
import { Offer } from '../models/Offer.js';
import { Outlet } from '../models/Outlet.js';
import connectDB from '../config/db.js';

const backfill = async () => {
    try {
        console.log('Starting Offer location backfill...');

        // Connect to Database
        await connectDB();
        console.log('Connected to DB');

        // Find offers without valid location
        const offers = await Offer.find({
            $or: [
                { location: { $exists: false } },
                { 'location.coordinates': { $exists: false } },
                { 'location.coordinates': { $size: 0 } }
            ]
        });

        console.log(`Found ${offers.length} offers needing location backfill.`);

        let success = 0;
        let fail = 0;
        let skipped = 0;

        // Cache outlets to reduce DB calls
        const outletCache = new Map();

        for (const offer of offers as any[]) {
            // Use the first outlet ID since user mentioned offer is for single outlet
            const outletId = offer.outlet_ids && offer.outlet_ids.length > 0 ? offer.outlet_ids[0].toString() : null;

            if (!outletId) {
                console.warn(`Offer ${offer._id} has no outlet_ids. Skipping.`);
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
                offer.location = {
                    type: 'Point',
                    coordinates: outlet.location.coordinates
                };

                await (offer as any).save();
                success++;

                if (success % 10 === 0) process.stdout.write('.');
            } else {
                fail++;
                console.warn(`Outlet ${outletId} missing location. Cannot backfill offer ${offer._id}`);
            }
        }

        console.log('\n');
        console.log('Backfill Complete');
        console.log(`Updated: ${success}`);
        console.log(`Failed (Outlet missing loc): ${fail}`);
        console.log(`Skipped (No outlet_id): ${skipped}`);

        process.exit(0);
    } catch (error) {
        console.error('Backfill failed:', error);
        process.exit(1);
    }
};

backfill();
