import { Router } from 'express';
import { staffAuthController } from '../controllers/staffAuth.controller.js';
import { staffAuthenticate } from '../middleware/staffAuth.middleware.js';

const router = Router();

router.post('/login', staffAuthController.login);
router.post('/refresh', staffAuthController.refresh);
router.post('/logout', staffAuthController.logout);
router.get('/me', staffAuthenticate, staffAuthController.me);

export default router;
