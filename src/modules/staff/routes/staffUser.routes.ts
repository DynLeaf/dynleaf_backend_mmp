import { Router } from 'express';
import { staffUserController } from '../controllers/staffUser.controller.js';
import { staffAuthenticate, requireRole } from '../middleware/staffAuth.middleware.js';

const router = Router();

router.use(staffAuthenticate);

// Admin and above can manage users
router.get('/', requireRole('admin'), staffUserController.getAll);
router.get('/:id', requireRole('admin'), staffUserController.getById);
router.post('/', requireRole('admin'), staffUserController.create);
router.put('/:id', requireRole('admin'), staffUserController.update);
router.patch('/:id/block', requireRole('admin'), staffUserController.blockUser);
router.patch('/:id/unblock', requireRole('admin'), staffUserController.unblockUser);

export default router;
