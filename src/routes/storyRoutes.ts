import express from 'express';
import { protect, requireOutletAccess } from '../middleware/authMiddleware.js';
import {
    createStory,
    getStoryFeed,
    getOutletStories,
    updateStoryStatus,
    deleteStory,
    recordView,
    getStoryAnalytics,
    getSeenStatus
} from '../controllers/storyController.js';

const router = express.Router();

// Public routes
router.get('/feed', getStoryFeed);
router.get('/outlet/:outletId', getOutletStories);
router.get('/seen-status', getSeenStatus);
router.post('/:storyId/view', recordView);

// Protected routes (Restaurant/Admin)
router.post('/', protect, createStory); // Body must contain outletId, internal check performs auth
router.patch('/:storyId/status', protect, updateStoryStatus);
router.delete('/:storyId', protect, deleteStory);
router.get('/outlet/:outletId/analytics', protect, getStoryAnalytics); // Internal check performs auth

export default router;
