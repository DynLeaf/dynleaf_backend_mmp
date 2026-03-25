import { Session } from '../../models/Session.js';

interface DeviceInfo {
    device_id: string;
    device_name?: string;
    device_type: 'mobile' | 'tablet' | 'desktop' | 'unknown';
    os?: string;
    browser?: string;
    ip_address: string;
}

export const countActiveSessions = (userId: string): Promise<number> =>
    Session.countDocuments({ user_id: userId, is_active: true });

export const findOldestActiveSession = (userId: string) =>
    Session.findOne({ user_id: userId, is_active: true }).sort({ last_used_at: 1 });

export const deactivateSession = (sessionId: unknown) =>
    Session.findByIdAndUpdate(sessionId, { is_active: false });

export const createSession = (data: {
    user_id: string;
    refresh_token_hash: string;
    device_info: DeviceInfo;
    expires_at: Date;
}) =>
    Session.create({
        ...data,
        is_active: true,
        last_used_at: new Date()
    });

export const findSessionById = (sessionId: string) =>
    Session.findById(sessionId);

export const touchSession = (sessionId: string) =>
    Session.findByIdAndUpdate(sessionId, { last_used_at: new Date() });

export const deactivateSessionById = (sessionId: string) =>
    Session.findByIdAndUpdate(sessionId, { is_active: false });

export const deactivateAllUserSessions = (userId: string) =>
    Session.updateMany({ user_id: userId }, { is_active: false });

export const deactivateSessionsByDevice = (userId: string, deviceId: string) =>
    Session.updateMany(
        { user_id: userId, 'device_info.device_id': deviceId },
        { is_active: false }
    );

export const findActiveUserSessions = (userId: string) =>
    Session.find({ user_id: userId, is_active: true }).sort({ last_used_at: -1 });

export const deleteExpiredSessions = () =>
    Session.deleteMany({ expires_at: { $lt: new Date() } });

export const rotateSessionToken = (sessionId: string, hash: string) =>
    Session.findByIdAndUpdate(sessionId, {
        refresh_token_hash: hash,
        last_used_at: new Date()
    });
