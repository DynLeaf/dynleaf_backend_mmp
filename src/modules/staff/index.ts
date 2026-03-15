import { Router } from 'express';
import staffAuthRoutes from './routes/staffAuth.routes.js';
import staffUserRoutes from './routes/staffUser.routes.js';
import customerRoutes from './routes/customer.routes.js';
import followupRoutes from './routes/followup.routes.js';
import orderRoutes from './routes/order.routes.js';
import earningsRoutes from './routes/earnings.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';

const router = Router();

router.use('/auth', staffAuthRoutes);
router.use('/users', staffUserRoutes);
router.use('/customers', customerRoutes);
router.use('/followups', followupRoutes);
router.use('/orders', orderRoutes);
router.use('/earnings', earningsRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
