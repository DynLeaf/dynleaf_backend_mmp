import { Router } from 'express';
import { earningsController } from '../controllers/earnings.controller.js';
import { staffAuthenticate, requireRole } from '../middleware/staffAuth.middleware.js';

const router = Router();

router.use(staffAuthenticate);

// Crafter routes
router.get('/my', requireRole('crafter'), earningsController.getMyEarnings);
router.get('/my/summary', requireRole('crafter'), earningsController.getMySummary);
router.get('/my/payouts', requireRole('crafter'), earningsController.getMyPayouts);

// Admin routes
router.get('/payouts', requireRole('admin'), earningsController.getAllPayouts);
router.get('/payouts/pending', requireRole('admin'), earningsController.getPendingPayouts);
router.post('/payouts', requireRole('admin'), earningsController.createPayout);
router.patch('/payouts/:id/pay', requireRole('admin'), earningsController.markPayoutPaid);

// Admin Earnings management
router.get('/', requireRole('admin'), earningsController.getAllEarnings);
router.patch('/status', requireRole('admin'), earningsController.updateEarningsStatus);

export default router;
