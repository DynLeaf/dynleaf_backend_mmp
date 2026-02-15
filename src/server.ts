import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app.js';
import connectDB from './config/db.js';
import { startAnalyticsAggregation } from './jobs/aggregatePromotionAnalytics.js';
import { startOutletAnalyticsAggregation } from './jobs/aggregateOutletAnalytics.js';
import { startFoodItemAnalyticsAggregation } from './jobs/aggregateFoodItemAnalytics.js';
import { fallbackRetryJob } from './jobs/fallbackRetryJob.js';
import { InsightsCronService } from './services/insightsCronService.js';
import { initializeS3Service } from './services/s3Service.js';

const PORT = Number(process.env.PORT) || 5005;

const startServer = async () => {
    try {
        console.log('---------------------------------------------------------');
        console.log('🚀 [DIAGNOSTIC] Backend Starting - Logic Updated Jan 24');
        console.log('---------------------------------------------------------');
        
        // Initialize S3 service if credentials are provided
        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET_NAME) {
            try {
                const s3Service = initializeS3Service({
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    region: process.env.AWS_REGION || 'ap-south-2',
                    bucketName: process.env.AWS_S3_BUCKET_NAME,
                    cdnUrl: process.env.AWS_S3_CDN_URL
                });
                
                // Validate bucket connectivity
                const isValid = await s3Service.validateBucket();
                if (isValid) {
                    console.log('✅ S3 service initialized successfully');
                } else {
                    console.warn('⚠️ S3 bucket validation failed - uploads may not work');
                }
            } catch (error: any) {
                console.warn('⚠️ Failed to initialize S3 service:', error.message);
            }
        } else {
            console.warn('⚠️ AWS credentials not found - S3 uploads disabled');
        }

        await connectDB();
        

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

