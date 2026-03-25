import { Router } from 'express';
import { adminAuth } from '../../middleware/adminMiddleware.js';
import * as outletController from '../../controllers/admin/adminOutletController.js';
import * as adminDeleteController from '../../controllers/adminDeleteController.js';

const router = Router();

router.use(adminAuth);

router.get('/', outletController.getOutlets);
router.get('/:id', outletController.getOutletDetail);
router.patch('/:id/status', outletController.updateOutletStatus);
router.patch('/:id/change-owner', outletController.changeOutletOwner);
router.delete('/:id', adminDeleteController.hardDeleteOutlet);

export default router;
