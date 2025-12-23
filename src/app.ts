import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/authRoutes.js';
import brandRoutes from './routes/brandRoutes.js';
import outletRoutes from './routes/outletRoutes.js';
import menuRoutes from './routes/menuRoutes.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'Welcome to Dynleaf API' });
});

app.use('/v1/auth', authRoutes);
app.use('/v1/brands', brandRoutes);
app.use('/v1/outlets', outletRoutes);
app.use('/v1', menuRoutes); // Menu routes handle multiple paths


export default app;
