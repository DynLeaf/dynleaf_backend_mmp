import { Router } from 'express';
import { customerController } from '../controllers/customer.controller.js';
import { staffAuthenticate, requireRole } from '../middleware/staffAuth.middleware.js';

const router = Router();

router.use(staffAuthenticate);

router.get('/', requireRole('salesman', 'admin'), customerController.getAll);
router.get('/:id', requireRole('salesman', 'admin'), customerController.getById);
router.post('/', requireRole('salesman'), customerController.create);
router.put('/:id', requireRole('salesman', 'admin'), customerController.update);
router.patch('/:id/convert', requireRole('salesman'), customerController.markConverted);
router.patch('/:id/cancel', requireRole('salesman', 'admin'), customerController.markCancelled);
router.patch('/:id/active', requireRole('salesman', 'admin'), customerController.markActive);

export default router;
