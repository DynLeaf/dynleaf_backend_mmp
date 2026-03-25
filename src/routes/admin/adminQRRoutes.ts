import express from 'express';
import * as qrManagementController from '../../controllers/qr/qrManagementController.js';
import * as mallQRController from '../../controllers/qr/mallQRController.js';
import { adminAuth } from '../../middleware/adminMiddleware.js';

const router = express.Router();

router.use(adminAuth);

router.get('/outlets', qrManagementController.getApprovedOutlets);
router.get('/malls', mallQRController.getDerivedMalls);
router.get('/outlets/:outletId/config', qrManagementController.getOutletQRConfig);
router.get('/malls/:mallKey/config', mallQRController.getMallQRConfig);
router.post('/outlets/:outletId/generate', qrManagementController.updateOutletQRConfig);
router.get('/outlets/:outletId/all-qrs', qrManagementController.getAllOutletQRs);
router.post('/malls/:mallKey/generate', mallQRController.updateMallQRConfig);
router.post('/malls/upload-via-backend', mallQRController.uploadMallImage);

export default router;
