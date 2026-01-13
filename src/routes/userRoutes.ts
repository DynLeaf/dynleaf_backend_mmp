import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import * as userController from '../controllers/userController.js';
import * as notificationController from '../controllers/notificationController.js';

const router = Router();

router.get('/profile', authenticate, userController.getUserProfile);
router.patch('/profile', authenticate, userController.updateUserProfile);
router.post('/profile/avatar', authenticate, userController.uploadAvatar);

// Notifications
router.get('/notifications', authenticate, notificationController.getMyNotifications);
router.post('/notifications/register-token', authenticate, notificationController.registerPushToken);
router.patch('/notifications/mark-all-read', authenticate, notificationController.markAllRead);
router.patch('/notifications/:notificationId/mark-read', authenticate, notificationController.markRead);

export default router;
