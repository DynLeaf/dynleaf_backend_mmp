import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app.js';
import connectDB from './config/db.js';
import { startAnalyticsAggregation } from './jobs/aggregatePromotionAnalytics.js';
import { startOutletAnalyticsAggregation } from './jobs/aggregateOutletAnalytics.js';
import { startFoodItemAnalyticsAggregation } from './jobs/aggregateFoodItemAnalytics.js';
import { fallbackRetryJob } from './jobs/fallbackRetryJob.js';
import { InsightsCronService } from './services/insightsCronService.js';
const PORT = Number(process.env.PORT) || 5005;

const startServer = async () => {
    try {
        await connectDB();
        console.log(
            `[mongo] connected host=${mongoose.connection.host} db=${mongoose.connection.name}`
        );

        // Start cron jobs
        startAnalyticsAggregation();
        startOutletAnalyticsAggregation();
        startFoodItemAnalyticsAggregation();

        // Start fallback retry job for analytics
        fallbackRetryJob.start();
        console.log('✅ Analytics fallback retry job started');

        // Start insights cron jobs
        InsightsCronService.start();
        console.log('✅ Insights cron jobs started');

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
