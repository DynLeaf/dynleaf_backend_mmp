import bcrypt from 'bcryptjs';
import { Session } from '../models/Session.js';
import mongoose from 'mongoose';

interface DeviceInfo {
    device_id: string;
    device_name?: string;
    device_type: 'mobile' | 'tablet' | 'desktop' | 'unknown';
    os?: string;
    browser?: string;
    ip_address: string;
}

export const createSession = async (
    userId: string,
    refreshToken: string,
    deviceInfo: DeviceInfo
): Promise<any> => {
    const activeSessions = await Session.countDocuments({
        user_id: userId,
        is_active: true
    });

    if (activeSessions >= 5) {
        const oldestSession = await Session.findOne({
            user_id: userId,
            is_active: true
        }).sort({ last_used_at: 1 });

        if (oldestSession) {
            oldestSession.is_active = false;
            await oldestSession.save();
        }
    }

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const session = await Session.create({
        user_id: userId,
        refresh_token_hash: refreshTokenHash,
        device_info: deviceInfo,
        is_active: true,
        expires_at: expiresAt,
        last_used_at: new Date()
    });

    return session;
};

export const validateSession = async (sessionId: string): Promise<boolean> => {
    const session = await Session.findById(sessionId);
    
    if (!session) return false;
    if (!session.is_active) return false;
    if (session.expires_at < new Date()) return false;

    return true;
};

export const updateSessionActivity = async (sessionId: string): Promise<void> => {
    await Session.findByIdAndUpdate(sessionId, {
        last_used_at: new Date()
    });
};

export const revokeSession = async (sessionId: string): Promise<void> => {
    await Session.findByIdAndUpdate(sessionId, {
        is_active: false
    });
};

export const revokeAllSessions = async (userId: string): Promise<void> => {
    await Session.updateMany(
        { user_id: userId },
        { is_active: false }
    );
};

export const revokeSessionByDevice = async (userId: string, deviceId: string): Promise<void> => {
    await Session.updateMany(
        { 
            user_id: userId,
            'device_info.device_id': deviceId
        },
        { is_active: false }
    );
};

export const getUserSessions = async (userId: string): Promise<any[]> => {
    const sessions = await Session.find({
        user_id: userId,
        is_active: true
    }).sort({ last_used_at: -1 });

    return sessions.map(session => ({
        id: session._id,
        deviceInfo: session.device_info,
        lastUsedAt: session.last_used_at,
        createdAt: session.created_at
    }));
};

export const cleanupExpiredSessions = async (): Promise<number> => {
    const result = await Session.deleteMany({
        expires_at: { $lt: new Date() }
    });

    return result.deletedCount || 0;
};

export const verifyRefreshToken = async (
    sessionId: string,
    refreshToken: string
): Promise<boolean> => {
    const session = await Session.findById(sessionId);
    
    if (!session || !session.is_active) return false;
    if (session.expires_at < new Date()) return false;

    return await bcrypt.compare(refreshToken, session.refresh_token_hash);
};

export const rotateRefreshToken = async (
    sessionId: string,
    newRefreshToken: string
): Promise<void> => {
    const refreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
    
    await Session.findByIdAndUpdate(sessionId, {
        refresh_token_hash: refreshTokenHash,
        last_used_at: new Date()
    });
};
