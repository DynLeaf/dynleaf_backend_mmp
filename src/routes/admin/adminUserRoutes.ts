import { Router } from 'express';
import { adminAuth } from '../../middleware/adminMiddleware.js';
import * as userController from '../../controllers/admin/adminUserController.js';

const router = Router();

router.use(adminAuth);

router.get('/', userController.getUsers);
router.get('/:id', userController.getUserDetail);
router.patch('/:id/block', userController.blockUser);
router.patch('/:id/unblock', userController.unblockUser);

export default router;
