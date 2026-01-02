import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import connectDB from './config/db.js';
import { connectRedis } from './config/redis.js';
import { startAnalyticsAggregation } from './jobs/aggregatePromotionAnalytics.js';
import { startOutletAnalyticsAggregation } from './jobs/aggregateOutletAnalytics.js';

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
    try {
        await connectDB();
        await connectRedis();
        
        // Start cron jobs
        startAnalyticsAggregation();
        startOutletAnalyticsAggregation();
        
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
