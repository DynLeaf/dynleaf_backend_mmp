import bcrypt from 'bcryptjs';
import { getRedisClient } from '../config/redis.js';
import { OTP } from '../models/OTP.js';

const OTP_EXPIRY = parseInt(process.env.OTP_EXPIRY || '300');
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '3');
const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || '6');

export const generateOTP = (): string => {
    const min = Math.pow(10, OTP_LENGTH - 1);
    const max = Math.pow(10, OTP_LENGTH) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
};

export const sendOTP = async (phone: string): Promise<{ success: boolean; expiresIn: number }> => {
    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);
    
    const redis = getRedisClient();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY * 1000);

    if (redis) {
        await redis.setex(`otp:${phone}`, OTP_EXPIRY, otpHash);
        await redis.setex(`otp:attempts:${phone}`, OTP_EXPIRY, '0');
    } else {
        await OTP.deleteMany({ phone, verified: false });
        await OTP.create({
            phone,
            otp_hash: otpHash,
            attempts: 0,
            expires_at: expiresAt,
            verified: false
        });
    }

    if (process.env.NODE_ENV === 'development') {
        console.log(`📱 OTP for ${phone}: ${otp}`);
    }

    return { success: true, expiresIn: OTP_EXPIRY };
};

export const verifyOTP = async (phone: string, otp: string): Promise<boolean> => {
    if (process.env.NODE_ENV === 'development' && otp === '123456') {
        return true;
    }

    const redis = getRedisClient();

    if (redis) {
        const storedHash = await redis.get(`otp:${phone}`);
        const attempts = parseInt(await redis.get(`otp:attempts:${phone}`) || '0');

        if (!storedHash) {
            throw new Error('OTP expired or not found');
        }

        if (attempts >= OTP_MAX_ATTEMPTS) {
            await redis.del(`otp:${phone}`);
            await redis.del(`otp:attempts:${phone}`);
            throw new Error('Maximum OTP attempts exceeded');
        }

        const isValid = await bcrypt.compare(otp, storedHash);

        if (!isValid) {
            await redis.incr(`otp:attempts:${phone}`);
            throw new Error('Invalid OTP');
        }

        await redis.del(`otp:${phone}`);
        await redis.del(`otp:attempts:${phone}`);
        return true;
    } else {
        const otpRecord = await OTP.findOne({
            phone,
            verified: false,
            expires_at: { $gt: new Date() }
        }).sort({ created_at: -1 });

        if (!otpRecord) {
            throw new Error('OTP expired or not found');
        }

        if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
            await OTP.deleteOne({ _id: otpRecord._id });
            throw new Error('Maximum OTP attempts exceeded');
        }

        const isValid = await bcrypt.compare(otp, otpRecord.otp_hash);

        if (!isValid) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            throw new Error('Invalid OTP');
        }

        otpRecord.verified = true;
        await otpRecord.save();
        return true;
    }
};

export const checkRateLimit = async (phone: string): Promise<{ allowed: boolean; retryAfter?: number }> => {
    const redis = getRedisClient();
    const window = parseInt(process.env.RATE_LIMIT_OTP_WINDOW || '3600');
    const maxAttempts = parseInt(process.env.RATE_LIMIT_OTP_SEND || '5');

    if (redis) {
        const key = `rate:otp:${phone}`;
        const count = await redis.incr(key);

        if (count === 1) {
            await redis.expire(key, window);
        }

        if (count > maxAttempts) {
            const ttl = await redis.ttl(key);
            return { allowed: false, retryAfter: ttl };
        }

        return { allowed: true };
    }

    const oneHourAgo = new Date(Date.now() - window * 1000);
    const recentOTPs = await OTP.countDocuments({
        phone,
        created_at: { $gte: oneHourAgo }
    });

    if (recentOTPs >= maxAttempts) {
        return { allowed: false, retryAfter: window };
    }

    return { allowed: true };
};
