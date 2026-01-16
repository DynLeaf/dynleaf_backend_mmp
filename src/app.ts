import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/authRoutes.js';
import brandRoutes from './routes/brandRoutes.js';
import outletRoutes from './routes/outletRoutes.js';
import menuRoutes from './routes/menuRoutes.js';
import outletMenuRoutes from './routes/outletMenuRoutes.js';
import outletMenuManagementRoutes from './routes/outletMenuManagementRoutes.js';
import foodSearchRoutes from './routes/foodSearchRoutes.js';
import brandOutletRoutes from './routes/brandOutletRoutes.js';
import onboardingRoutes from './routes/onboardingRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import offerRoutes from './routes/offerRoutes.js';
import offerSearchRoutes from './routes/offerSearchRoutes.js';
import storyRoutes from './routes/storyRoutes.js';
import userRoutes from './routes/userRoutes.js';
import businessRoutes from './routes/businessRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import foodItemAnalyticsRoutes from './routes/foodItemAnalyticsRoutes.js';
import analyticsBatchRoutes from './routes/analyticsBatchRoutes.js';
import geminiRoutes from './routes/geminiRoutes.js';
import followRoutes from './routes/followRoutes.js';
import placesRoutes from './routes/placesRoutes.js';
import socialShareRoutes, { restaurantShareRouter } from './routes/socialShareRoutes.js';
import './config/firebaseAdmin.js';
import logger from './middleware/logger.js';
import * as promotionController from './controllers/promotionController.js';
import errorHandler from './middleware/errorMiddleware.js';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, Postman, curl)
        if (!origin) return callback(null, true);

        const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',') || [];

        // Allow any origin from local network (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        const localNetworkPattern = /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

        if (allowedOrigins.includes(origin) || localNetworkPattern.test(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Request logger (prints method, url, status and response time)
app.use(logger);

app.get('/v1', (req, res) => {
    res.json({ message: 'Welcome to Dynleaf API' });
});

// Social share routes (must be before SPA routes to intercept /restaurant/:id)
app.use('/', restaurantShareRouter);

app.use('/v1/auth', authRoutes);
app.use('/v1/user', userRoutes);
app.use('/v1/uploads', uploadRoutes);
app.use('/v1/business', businessRoutes);
app.use('/v1/brands', brandOutletRoutes); // Brand routes (includes /featured)
app.use('/v1/brands', brandRoutes);
app.use('/v1/outlets', brandOutletRoutes); // Outlet routes (includes /nearby and /:outletId/detail)
app.use('/v1/outlets', outletRoutes);
app.use('/v1/outlets', outletMenuRoutes); // Outlet menu management (public)
app.use('/v1/outlets', outletMenuManagementRoutes); // Outlet menu management (CRUD)
app.use('/v1/food', foodSearchRoutes); // NEW: Food search with OutletMenuItem
app.use('/v1/onboarding', onboardingRoutes);
app.use('/v1/admin', adminRoutes);
app.use('/v1/admin', subscriptionRoutes);
app.use('/v1/outlets', offerRoutes);
app.use('/v1/outlets', followRoutes);
app.use('/v1/offers', offerSearchRoutes);
app.use('/v1/stories', storyRoutes);
app.use('/v1/places', placesRoutes);
app.use('/v1', menuRoutes); // Menu routes handle multiple paths

// Food item analytics
app.use('/v1/analytics/food-items', foodItemAnalyticsRoutes);
app.use('/v1/analytics', analyticsBatchRoutes);

// AI-powered features (Gemini)
app.use('/v1/gemini', geminiRoutes);

// Public social share meta proxy
app.use('/v1/social-share', socialShareRoutes);

// Public promotion routes
app.get('/v1/promotions/featured', promotionController.getFeaturedPromotions);
app.post('/v1/promotions/:id/impression', promotionController.trackImpression);
app.post('/v1/promotions/:id/click', promotionController.trackClick);

// Global error handler (should be after routes)
app.use(errorHandler);


export default app;
