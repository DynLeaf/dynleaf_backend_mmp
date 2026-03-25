import { Router } from 'express';
import { adminAuth } from '../../middleware/adminMiddleware.js';
import * as moderationController from '../../controllers/admin/adminModerationController.js';

const router = Router();

router.use(adminAuth);

router.get('/stories', moderationController.getModerationStories);
router.post('/stories/:id/approve', moderationController.approveStory);
router.post('/stories/:id/reject', moderationController.rejectStory);

export default router;
