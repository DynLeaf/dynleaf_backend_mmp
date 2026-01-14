import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import * as followController from '../controllers/followController.js';

const router = express.Router();

// User actions
router.post('/:outletId/follow', authenticate, followController.followOutlet);
router.post('/:outletId/unfollow', authenticate, followController.unfollowOutlet);
router.get('/:outletId/status', authenticate, followController.checkFollowStatus);
router.get('/my/followed', authenticate, followController.getFollowedOutlets);
// router.get('/my/ids', authenticate, followController.getFollowedOutletIds);

// Public/Admin stats
router.get('/:outletId/followers/count', followController.getOutletFollowersCount);

export default router;
