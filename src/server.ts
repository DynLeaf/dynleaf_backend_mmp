import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always load backend/.env regardless of the process working directory.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import mongoose from 'mongoose';
import app from './app.js';
import connectDB from './config/db.js';
import { connectRedis } from './config/redis.js';
import { startAnalyticsAggregation } from './jobs/aggregatePromotionAnalytics.js';
import { startOutletAnalyticsAggregation } from './jobs/aggregateOutletAnalytics.js';
import { startFoodItemAnalyticsAggregation } from './jobs/aggregateFoodItemAnalytics.js';

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
    try {
        await connectDB();
        console.log(
            `[mongo] connected host=${mongoose.connection.host} db=${mongoose.connection.name}`
        );
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
