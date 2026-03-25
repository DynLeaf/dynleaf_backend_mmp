import bcrypt from 'bcryptjs';
import { normalizePhoneE164, sendOtpSms } from './smsService.js';
import * as otpRepo from '../repositories/auth/otpRepository.js';

const OTP_EXPIRY = parseInt(process.env.OTP_EXPIRY || '300');
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '3');
const OTP_LENGTH = parseInt(process.env.OTP_LENGTH || '6');
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_OTP_WINDOW || '3600');
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_OTP_SEND || '5');

export const generateOTP = (): string => {
    const min = Math.pow(10, OTP_LENGTH - 1);
    const max = Math.pow(10, OTP_LENGTH) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
};

export const sendOTP = async (phone: string): Promise<{ success: boolean; expiresIn: number }> => {
    const normalizedPhone = normalizePhoneE164(phone);
    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);

    await otpRepo.upsertOtp(normalizedPhone, otpHash);

    if (process.env.NODE_ENV === 'production') {
        await sendOtpSms(normalizedPhone, otp);
    }

    return { success: true, expiresIn: OTP_EXPIRY };
};

export const verifyOTP = async (phone: string, otp: string): Promise<boolean> => {
    if (process.env.NODE_ENV !== 'production' && otp === '000000') return true;

    const normalizedPhone = normalizePhoneE164(phone);
    const otpDoc = await otpRepo.findOtpByPhone(normalizedPhone);

    if (!otpDoc) throw new Error('OTP expired or not found');

    if (otpDoc.attempts >= OTP_MAX_ATTEMPTS) {
        await otpRepo.deleteOtpByPhone(normalizedPhone);
        throw new Error('Maximum OTP attempts exceeded');
    }

    const isValid = await bcrypt.compare(otp, otpDoc.otpHash);
    if (!isValid) {
        await otpRepo.incrementOtpAttempts(normalizedPhone);
        throw new Error('Invalid OTP');
    }

    await otpRepo.deleteOtpByPhone(normalizedPhone);
    return true;
};

export const checkRateLimit = async (phone: string): Promise<{ allowed: boolean; retryAfter?: number }> => {
    const normalizedPhone = normalizePhoneE164(phone);
    const key = `rate:otp:${normalizedPhone}`;

    const rateLimitDoc = await otpRepo.findOrCreateRateLimit(key);

    if (rateLimitDoc.count > RATE_LIMIT_MAX) {
        const elapsed = (Date.now() - rateLimitDoc.createdAt.getTime()) / 1000;
        const ttl = Math.max(0, Math.ceil(RATE_LIMIT_WINDOW - elapsed));
        return { allowed: false, retryAfter: ttl };
    }

    return { allowed: true };
};
