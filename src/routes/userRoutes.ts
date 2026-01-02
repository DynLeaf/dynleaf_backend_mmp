import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import * as userController from '../controllers/userController.js';

const router = Router();

router.get('/profile', authenticate, userController.getUserProfile);
router.patch('/profile', authenticate, userController.updateUserProfile);
router.post('/profile/avatar', authenticate, userController.uploadAvatar);

export default router;
