import { Router } from 'express';
import { adminAuth } from '../../middleware/adminMiddleware.js';
import * as outletController from '../../controllers/admin/adminOutletController.js';

const router = Router();

router.use(adminAuth);

router.patch('/:id/toggle-verification', outletController.toggleComplianceVerification);
router.patch('/:id', outletController.updateCompliance);

export default router;
