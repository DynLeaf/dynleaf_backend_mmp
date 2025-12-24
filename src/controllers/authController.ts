import { Request, Response } from 'express';
import { User } from '../models/User.js';
import { Brand } from '../models/Brand.js';
import { Outlet } from '../models/Outlet.js';
import { Session } from '../models/Session.js';
import * as otpService from '../services/otpService.js';
import * as tokenService from '../services/tokenService.js';
import * as sessionService from '../services/sessionService.js';

interface AuthRequest extends Request {
    user?: any;
}

export const sendOtp = async (req: Request, res: Response) => {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }

        const rateLimit = await otpService.checkRateLimit(phone);
        if (!rateLimit.allowed) {
            return res.status(429).json({ 
                error: 'Too many OTP requests',
                retryAfter: rateLimit.retryAfter 
            });
        }

        const result = await otpService.sendOTP(phone);

        res.json({
            success: true,
            message: 'OTP sent successfully',
            expiresIn: result.expiresIn
        });
    } catch (error: any) {
        console.error('Send OTP error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const verifyOtp = async (req: Request, res: Response) => {
    try {
        const { phone, otp, deviceInfo } = req.body;
        
        if (!phone || !otp) {
            return res.status(400).json({ error: 'Phone and OTP are required' });
        }

        if (!deviceInfo || !deviceInfo.device_id) {
            return res.status(400).json({ error: 'Device information is required' });
        }

        const isValid = await otpService.verifyOTP(phone, otp);
        
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid OTP' });
        }

        let user = await User.findOne({ phone });
        
        if (!user) {
            user = await User.create({
                phone,
                roles: [{
                    scope: 'platform',
                    role: 'customer',
                    assignedAt: new Date()
                }],
                is_verified: true,
                is_active: true,
                currentStep: 'BRAND'
            });
        }

        if (user.is_suspended) {
            return res.status(403).json({ 
                error: 'Account suspended',
                reason: user.suspension_reason 
            });
        }

        if (user.locked_until && user.locked_until > new Date()) {
            return res.status(403).json({ 
                error: 'Account temporarily locked',
                locked_until: user.locked_until 
            });
        }

        const accessToken = tokenService.generateAccessToken(user, '', undefined);
        const refreshToken = tokenService.generateRefreshToken(user._id.toString(), '', 1);

        const session = await sessionService.createSession(
            user._id.toString(),
            refreshToken,
            {
                ...deviceInfo,
                ip_address: req.ip || req.socket.remoteAddress || 'unknown'
            }
        );

        const newAccessToken = tokenService.generateAccessToken(user, session._id.toString(), undefined);
        const newRefreshToken = tokenService.generateRefreshToken(user._id.toString(), session._id.toString(), 1);
        
        await sessionService.rotateRefreshToken(session._id.toString(), newRefreshToken);

        user.last_login_at = new Date();
        user.last_login_ip = req.ip || req.socket.remoteAddress;
        user.last_login_device = deviceInfo.device_name;
        user.failed_login_attempts = 0;
        await user.save();

        const brands = await Brand.find({ admin_user_id: user._id });
        const outlets = await Outlet.find({ created_by_user_id: user._id });

        const hasCompletedOnboarding = user.roles.some(r => r.role === 'restaurant_owner') && 
                                      brands.length > 0 && 
                                      user.currentStep === 'DONE';

        res.json({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            user: {
                id: user._id,
                phone: user.phone,
                email: user.email,
                username: user.username,
                avatar_url: user.avatar_url,
                roles: user.roles,
                currentStep: user.currentStep,
                hasCompletedOnboarding,
                brands: brands.map(b => ({ id: b._id, name: b.name, slug: b.slug })),
                outlets: outlets.map(o => ({ id: o._id, name: o.name, brandId: o.brand_id })),
                is_verified: user.is_verified,
                is_active: user.is_active
            }
        });
    } catch (error: any) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const refreshToken = async (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }

        const decoded = tokenService.verifyRefreshToken(refreshToken);
        
        const isValidSession = await sessionService.validateSession(decoded.sessionId);
        if (!isValidSession) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        const isValidToken = await sessionService.verifyRefreshToken(decoded.sessionId, refreshToken);
        if (!isValidToken) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        const user = await User.findById(decoded.id);
        if (!user || !user.is_active || user.is_suspended) {
            return res.status(401).json({ error: 'User not found or inactive' });
        }

        const newAccessToken = tokenService.generateAccessToken(user, decoded.sessionId, undefined);
        const newRefreshToken = tokenService.generateRefreshToken(user._id.toString(), decoded.sessionId, decoded.tokenVersion + 1);

        await sessionService.rotateRefreshToken(decoded.sessionId, newRefreshToken);

        res.json({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
        });
    } catch (error: any) {
        console.error('Refresh token error:', error);
        res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
};

export const logout = async (req: AuthRequest, res: Response) => {
    try {
        const { deviceId, allDevices } = req.body;
        const userId = req.user.id;

        if (allDevices) {
            await sessionService.revokeAllSessions(userId);
        } else if (deviceId) {
            await sessionService.revokeSessionByDevice(userId, deviceId);
        } else {
            await sessionService.revokeSession(req.user.sessionId);
        }

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error: any) {
        console.error('Logout error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const brands = await Brand.find({ admin_user_id: user._id });
        const outlets = await Outlet.find({ created_by_user_id: user._id });

        const hasCompletedOnboarding = user.roles.some(r => r.role === 'restaurant_owner') && 
                                      brands.length > 0 && 
                                      user.currentStep === 'DONE';

        res.json({
            user: {
                id: user._id,
                phone: user.phone,
                email: user.email,
                username: user.username,
                avatar_url: user.avatar_url,
                roles: user.roles,
                activeRole: req.user.activeRole,
                currentStep: user.currentStep,
                hasCompletedOnboarding,
                brands: brands.map(b => ({ 
                    id: b._id, 
                    name: b.name, 
                    slug: b.slug,
                    logo_url: b.logo_url 
                })),
                outlets: outlets.map(o => ({ 
                    id: o._id, 
                    name: o.name, 
                    brandId: o.brand_id,
                    status: o.status 
                })),
                permissions: req.user.permissions,
                is_verified: user.is_verified,
                is_active: user.is_active,
                last_login_at: user.last_login_at
            }
        });
    } catch (error: any) {
        console.error('Get current user error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const switchRole = async (req: AuthRequest, res: Response) => {
    try {
        const { scope, role, brandId, outletId } = req.body;
        const userId = req.user.id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const hasRole = user.roles.some(r => {
            if (r.scope !== scope || r.role !== role) return false;
            if (brandId && r.brandId?.toString() !== brandId) return false;
            if (outletId && r.outletId?.toString() !== outletId) return false;
            return true;
        });

        if (!hasRole) {
            return res.status(403).json({ error: 'You do not have this role' });
        }

        const activeRole = {
            scope,
            role,
            brandId,
            outletId
        };

        const newAccessToken = tokenService.generateAccessToken(user, req.user.sessionId, activeRole);

        user.preferred_role = role;
        await user.save();

        res.json({
            accessToken: newAccessToken,
            user: {
                id: user._id,
                activeRole
            }
        });
    } catch (error: any) {
        console.error('Switch role error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getSessions = async (req: AuthRequest, res: Response) => {
    try {
        const sessions = await sessionService.getUserSessions(req.user.id);
        
        const sessionsWithCurrent = sessions.map(session => ({
            ...session,
            isCurrent: session.id.toString() === req.user.sessionId
        }));

        res.json({ sessions: sessionsWithCurrent });
    } catch (error: any) {
        console.error('Get sessions error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const deleteSession = async (req: AuthRequest, res: Response) => {
    try {
        const { sessionId } = req.params;
        
        const session = await Session.findById(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (session.user_id.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        await sessionService.revokeSession(sessionId);

        res.json({ success: true, message: 'Session deleted successfully' });
    } catch (error: any) {
        console.error('Delete session error:', error);
        res.status(500).json({ error: error.message });
    }
};
