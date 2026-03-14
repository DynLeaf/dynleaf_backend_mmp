import { Router } from 'express';
import { orderController } from '../controllers/order.controller.js';
import { staffAuthenticate, requireRole } from '../middleware/staffAuth.middleware.js';

const router = Router();

router.use(staffAuthenticate);

router.get('/', orderController.getAll);
router.get('/pending', requireRole('crafter', 'admin'), orderController.getPending);
router.get('/:id', orderController.getById);
router.post('/', requireRole('salesman'), orderController.create);
router.patch('/:id/accept', requireRole('crafter'), orderController.accept);
router.patch('/:id/reject', requireRole('crafter'), orderController.reject);
router.patch('/:id/status', requireRole('crafter'), orderController.updateStatus);
router.patch('/:id/resubmit', requireRole('salesman'), orderController.resubmit);
router.patch('/:id/sales-note', requireRole('salesman'), orderController.addSalesNote);
router.patch('/:id/crafter-note', requireRole('crafter'), orderController.addCrafterNote);

export default router;
