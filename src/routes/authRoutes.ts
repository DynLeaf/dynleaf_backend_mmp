import express from 'express';
import { 
    sendOtp, 
    verifyOtp, 
    refreshToken, 
    logout, 
    getCurrentUser, 
    switchRole,
    getSessions,
    deleteSession,
    adminLogin,
    adminLogout
} from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { otpSendLimiter, otpVerifyLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/otp/send', otpSendLimiter, sendOtp);
router.post('/otp/verify', otpVerifyLimiter, verifyOtp);
router.post('/refresh', refreshToken);

router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getCurrentUser);
router.post('/switch-role', authenticate, switchRole);
router.get('/sessions', authenticate, getSessions);
router.delete('/sessions/:sessionId', authenticate, deleteSession);

// Admin routes
router.post('/admin/login', adminLogin);
router.post('/admin/logout', adminLogout);

export default router;
