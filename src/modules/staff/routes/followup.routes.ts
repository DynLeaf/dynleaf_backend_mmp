import { Router } from 'express';
import { followupController } from '../controllers/followup.controller.js';
import { staffAuthenticate, requireRole } from '../middleware/staffAuth.middleware.js';

const router = Router();

router.use(staffAuthenticate);

router.get('/mine', requireRole('salesman'), followupController.getMine);
router.get('/today', requireRole('salesman'), followupController.getToday);
router.get('/missed', requireRole('salesman'), followupController.getMissed);
router.get('/customer/:customerId', requireRole('salesman', 'admin'), followupController.getByCustomer);
router.post('/', requireRole('salesman'), followupController.create);
router.patch('/:id/reschedule', requireRole('salesman'), followupController.reschedule);
router.patch('/:id/note', requireRole('salesman'), followupController.addNote);
router.patch('/:id/done', requireRole('salesman'), followupController.markDone);

export default router;
