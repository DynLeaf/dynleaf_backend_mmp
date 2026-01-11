import bcrypt from 'bcryptjs';
import { getRedisClient } from '../config/redis.js';
import { normalizePhoneE164, sendOtpSms } from './smsService.js';

const OTP_EXPIRY = parseInt(process.env.OTP_EXPIRY || '300');
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '3');
const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || '6');

export const generateOTP = (): string => {
    const min = Math.pow(10, OTP_LENGTH - 1);
    const max = Math.pow(10, OTP_LENGTH) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
};

export const sendOTP = async (phone: string): Promise<{ success: boolean; expiresIn: number }> => {
    const normalizedPhone = normalizePhoneE164(phone);
    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);

    const redis = getRedisClient();

    if (!redis) {
        throw new Error('Redis connection required for OTP service');
    }

    await redis.setex(`otp:${normalizedPhone}`, OTP_EXPIRY, otpHash);
    await redis.setex(`otp:attempts:${normalizedPhone}`, OTP_EXPIRY, '0');

    if (process.env.NODE_ENV === 'production') {
        await sendOtpSms(normalizedPhone, otp);
    } else {
        console.log(`[DEV MODE] OTP for ${normalizedPhone}: ${otp} (SMS NOT SENT)`);
    }

    return { success: true, expiresIn: OTP_EXPIRY };
};

export const verifyOTP = async (phone: string, otp: string): Promise<boolean> => {
    if (process.env.NODE_ENV !== 'production' && otp === '000000') {
        return true;
    }

    const normalizedPhone = normalizePhoneE164(phone);

    const redis = getRedisClient();

    if (!redis) {
        throw new Error('Redis connection required for OTP service');
    }

    const storedHash = await redis.get(`otp:${normalizedPhone}`);
    const attempts = parseInt(await redis.get(`otp:attempts:${normalizedPhone}`) || '0');

    if (!storedHash) {
        throw new Error('OTP expired or not found');
    }

    if (attempts >= OTP_MAX_ATTEMPTS) {
        await redis.del(`otp:${normalizedPhone}`);
        await redis.del(`otp:attempts:${normalizedPhone}`);
        throw new Error('Maximum OTP attempts exceeded');
    }

    const isValid = await bcrypt.compare(otp, storedHash);

    if (!isValid) {
        await redis.incr(`otp:attempts:${normalizedPhone}`);
        throw new Error('Invalid OTP');
    }

    await redis.del(`otp:${normalizedPhone}`);
    await redis.del(`otp:attempts:${normalizedPhone}`);
    return true;
};

export const checkRateLimit = async (phone: string): Promise<{ allowed: boolean; retryAfter?: number }> => {
    const redis = getRedisClient();
    const window = parseInt(process.env.RATE_LIMIT_OTP_WINDOW || '3600');
    const maxAttempts = parseInt(process.env.RATE_LIMIT_OTP_SEND || '5');
    const normalizedPhone = normalizePhoneE164(phone);

    if (!redis) {
        throw new Error('Redis connection required for rate limiting');
    }

    const key = `rate:otp:${normalizedPhone}`;
    const count = await redis.incr(key);

    if (count === 1) {
        await redis.expire(key, window);
    }

    if (count > maxAttempts) {
        const ttl = await redis.ttl(key);
        return { allowed: false, retryAfter: ttl };
    }

    return { allowed: true };
};
