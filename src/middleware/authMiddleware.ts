import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User.js';
import * as tokenService from '../services/tokenService.js';
import * as sessionService from '../services/sessionService.js';

export interface AuthRequest extends Request {
    user?: any;
    outlet?: any;
    subscription?: any;
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

        // Load the outlet to attach to request
        const Outlet = (await import('../models/Outlet.js')).Outlet;
        const outlet = await Outlet.findById(outletId).lean();

        if (!outlet) {
            return res.status(404).json({ error: 'Outlet not found' });
        }

        // Creator access: if the authenticated user created the outlet, allow access.
        // This prevents access regressions when role assignments are missing or stale.
        if ((outlet as any).created_by_user_id?.toString?.() === req.user.id?.toString?.()) {
            req.outlet = outlet as any;
            return next();
        }

        // Debug logging
        console.log('=== requireOutletAccess Debug ===');
        console.log('User ID:', req.user.id);
        console.log('Outlet ID:', outletId);
        console.log('Outlet brand_id:', outlet.brand_id?.toString());
        console.log('User roles:', JSON.stringify(req.user.roles, null, 2));

        const hasAccess = req.user.roles.some((r: any) => {
            console.log('Checking role:', r.role, 'scope:', r.scope);

            if (r.role === 'admin') {
                console.log('✓ Admin access granted');
                return true;
            }

            if (r.scope === 'outlet' && r.outletId?.toString() === outletId) {
                console.log('✓ Outlet-level access granted');
                return true;
            }

            if (r.scope === 'brand' && r.brandId) {
                const userBrandId = r.brandId.toString();
                const outletBrandId = outlet.brand_id?.toString();
                console.log('Brand comparison:', userBrandId, '===', outletBrandId, '?', userBrandId === outletBrandId);

                if (outletBrandId && userBrandId === outletBrandId) {
                    console.log('✓ Brand-level access granted');
                    return true;
                }
            }

            return false;
        });

        if (!hasAccess) {
            console.log('❌ Access denied');
            return res.status(403).json({
                error: 'No access to this outlet',
                message: 'You do not have permission to access this outlet'
            });
        }

        console.log('✓ Access granted');
        console.log('=================================');

        // Attach outlet to request for controllers to use
        req.outlet = outlet as any;
        next();
    } catch (error) {
        console.error('requireOutletAccess error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
};

export const adminOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const isAdmin = req.user.roles.some((r: any) => r.role === 'admin');

    if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }

    next();
};

// Optional authentication - attempts to authenticate but doesn't fail if no token
export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        let token = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else if (req.cookies && req.cookies.accessToken) {
            token = req.cookies.accessToken;
        }

        // If no token, just continue without authentication
        if (!token) {
            return next();
        }

        // Try to verify token
        const decoded = tokenService.verifyAccessToken(token);
        const isValidSession = await sessionService.validateSession(decoded.sessionId);

        if (!isValidSession) {
            // Invalid session, continue without auth
            return next();
        }

        const user = await User.findById(decoded.id).select('-password_hash');

        if (!user || !user.is_active || user.is_suspended) {
            // User issues, continue without auth
            return next();
        }

        // Valid user, attach to request
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
        // Any error, just continue without authentication
        next();
    }
};

export const protect = authenticate;
