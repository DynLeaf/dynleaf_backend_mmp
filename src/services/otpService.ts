import bcrypt from 'bcryptjs';
import { normalizePhoneE164, sendOtpSms } from './smsService.js';
import OTP from '../models/OTP.js';
import RateLimit from '../models/RateLimit.js';

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

    // Store OTP in MongoDB
    await OTP.findOneAndUpdate(
        { phone: normalizedPhone },
        {
            otpHash,
            attempts: 0,
            createdAt: new Date()
        },
        { upsert: true, new: true }
    );

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

    const otpDoc = await OTP.findOne({ phone: normalizedPhone });

    if (!otpDoc) {
        throw new Error('OTP expired or not found');
    }

    if (otpDoc.attempts >= OTP_MAX_ATTEMPTS) {
        await OTP.deleteOne({ phone: normalizedPhone });
        throw new Error('Maximum OTP attempts exceeded');
    }

    const isValid = await bcrypt.compare(otp, otpDoc.otpHash);

    if (!isValid) {
        await OTP.updateOne({ phone: normalizedPhone }, { $inc: { attempts: 1 } });
        throw new Error('Invalid OTP');
    }

    await OTP.deleteOne({ phone: normalizedPhone });
    return true;
};

export const checkRateLimit = async (phone: string): Promise<{ allowed: boolean; retryAfter?: number }> => {
    const window = parseInt(process.env.RATE_LIMIT_OTP_WINDOW || '3600');
    const maxAttempts = parseInt(process.env.RATE_LIMIT_OTP_SEND || '5');
    const normalizedPhone = normalizePhoneE164(phone);

    const key = `rate:otp:${normalizedPhone}`;

    let rateLimitDoc = await RateLimit.findOne({ key });

    if (!rateLimitDoc) {
        rateLimitDoc = await RateLimit.create({ key, count: 1, createdAt: new Date() });
    } else {
        rateLimitDoc.count += 1;
        await rateLimitDoc.save();
    }

    if (rateLimitDoc.count > maxAttempts) {
        const elapsed = (Date.now() - rateLimitDoc.createdAt.getTime()) / 1000;
        const ttl = Math.max(0, Math.ceil(window - elapsed));
        return { allowed: false, retryAfter: ttl };
    }

    return { allowed: true };
};

