import { Router } from 'express';
import { adminAuth } from '../../middleware/adminMiddleware.js';
import * as brandController from '../../controllers/admin/adminBrandController.js';
import * as adminDeleteController from '../../controllers/adminDeleteController.js';

const router = Router();

router.use(adminAuth);

router.get('/', brandController.getBrands);
router.patch('/:id/change-owner', brandController.changeBrandOwner);
router.get('/:id', brandController.getBrandDetail);
router.post('/:id/approve', brandController.approveBrand);
router.post('/:id/reject', brandController.rejectBrand);
router.delete('/:id', adminDeleteController.hardDeleteBrand);

router.get('/updates/requests', brandController.getBrandUpdates);
router.get('/updates/requests/:id', brandController.getBrandUpdateDetail);
router.post('/updates/requests/:id/approve', brandController.approveBrandUpdate);
router.post('/updates/requests/:id/reject', brandController.rejectBrandUpdate);

export default router;
