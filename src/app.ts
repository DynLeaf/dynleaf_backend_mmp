import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

import authRoutes from './routes/authRoutes.js';
import brandRoutes from './routes/brandRoutes.js';
import outletRoutes from './routes/outletRoutes.js';
import menuRoutes from './routes/menuRoutes.js';
import logger from './middleware/logger.js';
import errorHandler from './middleware/errorMiddleware.js';

dotenv.config();

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5001',
    credentials: true
}));
app.use(cookieParser());
app.use(express.json());

// Request logger (prints method, url, status and response time)
app.use(logger);

app.get('/v1', (req, res) => {
    res.json({ message: 'Welcome to Dynleaf API' });
});

app.use('/v1/auth', authRoutes);
app.use('/v1/brands', brandRoutes);
app.use('/v1/outlets', outletRoutes);
app.use('/v1', menuRoutes); // Menu routes handle multiple paths

// Global error handler (should be after routes)
app.use(errorHandler);


export default app;
