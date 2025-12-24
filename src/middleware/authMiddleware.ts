import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User.js';
import * as tokenService from '../services/tokenService.js';
import * as sessionService from '../services/sessionService.js';

interface AuthRequest extends Request {
    user?: any;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        let token = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else if (req.cookies && req.cookies.accessToken) {
            token = req.cookies.accessToken;
        }

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const decoded = tokenService.verifyAccessToken(token);

        const isValidSession = await sessionService.validateSession(decoded.sessionId);
        if (!isValidSession) {
            return res.status(401).json({ error: 'Session expired or invalid' });
        }

        const user = await User.findById(decoded.id).select('-password_hash');
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        if (!user.is_active) {
            return res.status(403).json({ error: 'Account deactivated' });
        }

        if (user.is_suspended) {
            return res.status(403).json({
                error: 'Account suspended',
                reason: user.suspension_reason
            });
        }

        req.user = {
            id: decoded.id,
            phone: decoded.phone,
            roles: decoded.roles,
            activeRole: decoded.activeRole,
            permissions: decoded.permissions,
            sessionId: decoded.sessionId
        };

        await sessionService.updateSessionActivity(decoded.sessionId);

        next();
    } catch (error: any) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

export const requireRole = (roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const hasRole = req.user.roles.some((r: any) => roles.includes(r.role));

        if (!hasRole) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
};

export const requirePermission = (permission: string) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (!req.user.permissions.includes(permission)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
};

export const requireBrandAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const brandId = req.params.brandId || req.params.id;

        if (!brandId) {
            return res.status(400).json({ error: 'Brand ID is required' });
        }

        const hasAccess = req.user.roles.some((r: any) => {
            if (r.role === 'admin') return true;
            if (r.scope === 'brand' && r.brandId?.toString() === brandId) return true;
            return false;
        });

        if (!hasAccess) {
            return res.status(403).json({ error: 'No access to this brand' });
        }

        next();
    } catch (error) {
        return res.status(500).json({ error: 'Server error' });
    }
};

export const requireOutletAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const outletId = req.params.outletId || req.params.id;

        if (!outletId) {
            return res.status(400).json({ error: 'Outlet ID is required' });
        }

        const hasAccess = req.user.roles.some((r: any) => {
            if (r.role === 'admin') return true;
            if (r.scope === 'outlet' && r.outletId?.toString() === outletId) return true;
            if (r.scope === 'brand' && r.brandId) return true;
            return false;
        });

        if (!hasAccess) {
            return res.status(403).json({ error: 'No access to this outlet' });
        }

        next();
    } catch (error) {
        return res.status(500).json({ error: 'Server error' });
    }
};

export const protect = authenticate;
