import OTP from '../../models/OTP.js';
import RateLimit from '../../models/RateLimit.js';

export const upsertOtp = (phone: string, otpHash: string) =>
    OTP.findOneAndUpdate(
        { phone },
        { otpHash, attempts: 0, createdAt: new Date() },
        { upsert: true, new: true }
    );

export const findOtpByPhone = (phone: string) =>
    OTP.findOne({ phone });

export const deleteOtpByPhone = (phone: string) =>
    OTP.deleteOne({ phone });

export const incrementOtpAttempts = (phone: string) =>
    OTP.updateOne({ phone }, { $inc: { attempts: 1 } });

export const findOrCreateRateLimit = async (key: string) => {
    const existing = await RateLimit.findOne({ key });
    if (!existing) {
        return RateLimit.create({ key, count: 1, createdAt: new Date() });
    }
    existing.count += 1;
    await existing.save();
    return existing;
};
