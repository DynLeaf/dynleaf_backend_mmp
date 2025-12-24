import { rateLimit } from 'express-rate-limit';
import type { Request } from 'express';

export const otpSendLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_OTP_WINDOW || '3600') * 1000,
    max: parseInt(process.env.RATE_LIMIT_OTP_SEND || '5'),
    message: { error: 'Too many OTP requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        return req.body.phone || req.ip || 'unknown';
    }
});

export const otpVerifyLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_OTP_VERIFY_WINDOW || '300') * 1000,
    max: parseInt(process.env.RATE_LIMIT_OTP_VERIFY || '3'),
    message: { error: 'Too many verification attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        return req.body.phone || req.ip || 'unknown';
    }
});

export const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});
