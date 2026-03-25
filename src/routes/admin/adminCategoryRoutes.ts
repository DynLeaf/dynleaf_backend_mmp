import { Router } from 'express';
import { adminAuth } from '../../middleware/adminMiddleware.js';
import * as categoryController from '../../controllers/admin/adminCategoryController.js';

const router = Router();

router.use(adminAuth);

router.post('/upload-signature', categoryController.getUploadSignature);
router.post('/upload-via-backend', categoryController.uploadViaBackend);
router.get('/', categoryController.getCategoryImages);
router.post('/', categoryController.createCategoryImage);
router.patch('/:id', categoryController.updateCategoryImage);
router.delete('/:id', categoryController.deleteCategoryImage);

router.get('/slug-map', categoryController.getCategorySlugMap);
router.patch('/slug-map/:slug', categoryController.updateCategorySlugMap);

router.get('/without-images', categoryController.getCategoriesWithoutImages);

export default router;
