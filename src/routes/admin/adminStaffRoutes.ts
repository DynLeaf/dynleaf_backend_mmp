import { Router } from 'express';
import { adminAuth } from '../../middleware/adminMiddleware.js';
import * as userController from '../../controllers/admin/adminUserController.js';

const router = Router();

router.use(adminAuth);

router.get('/sales-tracking', userController.getSalesTracking);
router.get('/crafter-tracking', userController.getCrafterTracking);
router.get('/users', userController.getStaffUsers);
router.post('/users', userController.createStaffUser);
router.patch('/users/:id/block', userController.blockStaffUser);
router.patch('/users/:id/unblock', userController.unblockStaffUser);

export default router;
