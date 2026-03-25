import bcrypt from 'bcryptjs';
import * as sessionRepo from '../repositories/session/sessionRepository.js';

interface DeviceInfo {
    device_id: string;
    device_name?: string;
    device_type: 'mobile' | 'tablet' | 'desktop' | 'unknown';
    os?: string;
    browser?: string;
    ip_address: string;
}

interface SessionDto {
    id: unknown;
    deviceInfo: unknown;
    lastUsedAt: Date;
    createdAt: Date;
}

export const createSession = async (
    userId: string,
    refreshToken: string,
    deviceInfo: DeviceInfo
): Promise<unknown> => {
    const activeSessions = await sessionRepo.countActiveSessions(userId);

    if (activeSessions >= 5) {
        const oldest = await sessionRepo.findOldestActiveSession(userId);
        if (oldest) {
            await sessionRepo.deactivateSession(oldest._id);
        }
    }

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return sessionRepo.createSession({ user_id: userId, refresh_token_hash: refreshTokenHash, device_info: deviceInfo, expires_at: expiresAt });
};

export const validateSession = async (sessionId: string): Promise<boolean> => {
    const session = await sessionRepo.findSessionById(sessionId);
    if (!session || !session.is_active) return false;
    if (session.expires_at < new Date()) return false;
    return true;
};

export const updateSessionActivity = (sessionId: string): Promise<unknown> =>
    sessionRepo.touchSession(sessionId);

export const revokeSession = (sessionId: string): Promise<unknown> =>
    sessionRepo.deactivateSessionById(sessionId);

export const revokeAllSessions = (userId: string): Promise<unknown> =>
    sessionRepo.deactivateAllUserSessions(userId);

export const revokeSessionByDevice = (userId: string, deviceId: string): Promise<unknown> =>
    sessionRepo.deactivateSessionsByDevice(userId, deviceId);

export const getUserSessions = async (userId: string): Promise<SessionDto[]> => {
    const sessions = await sessionRepo.findActiveUserSessions(userId);
    return sessions.map(session => ({
        id: session._id,
        deviceInfo: session.device_info,
        lastUsedAt: session.last_used_at,
        createdAt: session.created_at
    }));
};

export const cleanupExpiredSessions = async (): Promise<number> => {
    const result = await sessionRepo.deleteExpiredSessions();
    return result.deletedCount || 0;
};

export const verifyRefreshToken = async (sessionId: string, refreshToken: string): Promise<boolean> => {
    const session = await sessionRepo.findSessionById(sessionId);
    if (!session || !session.is_active) return false;
    if (session.expires_at < new Date()) return false;
    return bcrypt.compare(refreshToken, session.refresh_token_hash);
};

export const rotateRefreshToken = async (sessionId: string, newRefreshToken: string): Promise<void> => {
    const hash = await bcrypt.hash(newRefreshToken, 10);
    await sessionRepo.rotateSessionToken(sessionId, hash);
};
