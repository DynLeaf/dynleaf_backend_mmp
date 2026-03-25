import { Router } from 'express';
import { adminAuth } from '../../middleware/adminMiddleware.js';
import * as dashboardController from '../../controllers/admin/adminDashboardController.js';

const router = Router();

router.use(adminAuth);

router.get('/me', dashboardController.getMe);
router.get('/stats', dashboardController.getDashboardStats);

export default router;
