import { Router } from 'express';
import * as storyController from '../../controllers/story/storyController.js';
import * as storyMetricsController from '../../controllers/story/storyMetricsController.js';
import { authenticate } from '../../middleware/authMiddleware.js';

const router = Router();

// Public feed
router.get('/feed', storyController.getStoryFeed);
router.get('/outlet/:outletId', storyController.getOutletStories);

// Authenticated viewing
router.post('/:storyId/view', storyMetricsController.recordView);
router.get('/seen', storyMetricsController.getSeenStatus);

// Management
router.post('/', authenticate as any, storyController.createStory);
router.get('/admin/:outletId', authenticate as any, storyController.getAdminOutletStories);
router.patch('/:storyId/status', authenticate as any, storyController.updateStoryStatus);
router.delete('/:storyId', authenticate as any, storyController.deleteStory);
router.get('/analytics/:outletId', authenticate as any, storyMetricsController.getStoryAnalytics);

export default router;
