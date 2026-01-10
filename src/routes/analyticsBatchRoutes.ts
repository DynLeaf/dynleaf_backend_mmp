import { Router } from 'express';
import { processAnalyticsBatch } from '../controllers/analyticsBatchController.js';

const router = Router();

router.post('/batch', processAnalyticsBatch);

export default router;
