import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app.js';
import connectDB from './config/db.js';
import { connectRedis } from './config/redis.js';
import { startAnalyticsAggregation } from './jobs/aggregatePromotionAnalytics.js';
import { startOutletAnalyticsAggregation } from './jobs/aggregateOutletAnalytics.js';
import { startFoodItemAnalyticsAggregation } from './jobs/aggregateFoodItemAnalytics.js';
import { FoodItem } from './models/FoodItem.js';
import { Offer } from './models/Offer.js';
import { Outlet } from './models/Outlet.js';
import { OutletMenuItem } from './models/OutletMenuItem.js';

const PORT = Number(process.env.PORT) || 5005;

const startServer = async () => {
    try {
        await connectDB();
        console.log(
            `[mongo] connected host=${mongoose.connection.host} db=${mongoose.connection.name}`
        );

        // Ensure indexes for geospatial queries
        // This prevents $geoNear from failing on empty/new databases
        console.log('[mongo] Ensuring indexes...');
        await Promise.all([
            FoodItem.createIndexes(),
            Offer.createIndexes(),
            Outlet.createIndexes(),
            OutletMenuItem.createIndexes()
        ]);
        console.log('[mongo] Indexes ensured.');

        await connectRedis();

        // Start cron jobs
        startAnalyticsAggregation();
        startOutletAnalyticsAggregation();
        startFoodItemAnalyticsAggregation();

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server is running in ${process.env.NODE_ENV} mode on port ${PORT}`);
            console.log(`📱 Network access: http://<your-ip>:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
