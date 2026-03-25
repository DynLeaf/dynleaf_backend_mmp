import { Router } from 'express';
import { adminAuth } from '../../middleware/adminMiddleware.js';
import * as onboardingController from '../../controllers/admin/adminOnboardingController.js';

const router = Router();

router.use(adminAuth);

router.get('/requests', onboardingController.getOnboardingRequests);
router.get('/requests/:id', onboardingController.getOnboardingRequestDetail);
router.post('/:id/approve', onboardingController.approveOnboardingRequest);
router.post('/:id/reject', onboardingController.rejectOnboardingRequest);

export default router;
