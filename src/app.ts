import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/authRoutes.js';
import brandRoutes from './routes/brandRoutes.js';
import outletRoutes from './routes/outletRoutes.js';
import menuRoutes from './routes/menuRoutes.js';
import onboardingRoutes from './routes/onboardingRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import logger from './middleware/logger.js';
import errorHandler from './middleware/errorMiddleware.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors({
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:5001',
        'http://localhost:5173', // Main frontend
        'http://localhost:5174', // Admin portal
        'http://localhost:5175', // Admin portal (alternate)
    ],
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

app.use('/v1/auth', authRoutes);
app.use('/v1/brands', brandRoutes);
app.use('/v1/outlets', outletRoutes);
app.use('/v1/onboarding', onboardingRoutes);
app.use('/v1/admin', adminRoutes);
app.use('/v1', menuRoutes); // Menu routes handle multiple paths

// Global error handler (should be after routes)
app.use(errorHandler);


export default app;
