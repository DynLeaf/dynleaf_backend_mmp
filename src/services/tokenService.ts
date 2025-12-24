import jwt from 'jsonwebtoken';
import { IUser } from '../models/User.js';

interface TokenPayload {
    id: string;
    phone: string;
    roles: any[];
    activeRole?: any;
    permissions: string[];
    sessionId: string;
}

interface RefreshTokenPayload {
    id: string;
    sessionId: string;
    tokenVersion: number;
}

const JWT_SECRET: string = process.env.JWT_SECRET || 'supersecret';
const JWT_REFRESH_SECRET: string = process.env.JWT_REFRESH_SECRET || 'refreshsecret';
const JWT_ACCESS_EXPIRY: string = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY: string = process.env.JWT_REFRESH_EXPIRY || '30d';

export const generateAccessToken = (user: IUser, sessionId: string, activeRole?: any): string => {
    const permissions = extractPermissions(user, activeRole);
    
    const payload: TokenPayload = {
        id: user._id.toString(),
        phone: user.phone,
        roles: user.roles,
        activeRole: activeRole || null,
        permissions,
        sessionId
    };

    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRY } as jwt.SignOptions);
};

export const generateRefreshToken = (userId: string, sessionId: string, tokenVersion: number = 1): string => {
    const payload: RefreshTokenPayload = {
        id: userId,
        sessionId,
        tokenVersion
    };

    return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRY } as jwt.SignOptions);
};

export const verifyAccessToken = (token: string): TokenPayload => {
    try {
        return jwt.verify(token, JWT_SECRET) as TokenPayload;
    } catch (error) {
        throw new Error('Invalid or expired access token');
    }
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
    try {
        return jwt.verify(token, JWT_REFRESH_SECRET) as RefreshTokenPayload;
    } catch (error) {
        throw new Error('Invalid or expired refresh token');
    }
};

export const decodeToken = (token: string): any => {
    return jwt.decode(token);
};

const extractPermissions = (user: IUser, activeRole?: any): string[] => {
    const PLATFORM_PERMISSIONS: any = {
        customer: [
            'view_restaurants',
            'create_order',
            'view_own_orders',
            'create_review',
            'manage_own_profile'
        ],
        restaurant_owner: [
            'create_brand',
            'manage_own_brands',
            'create_outlet',
            'manage_own_outlets',
            'view_analytics',
            'manage_menu'
        ],
        admin: [
            'manage_all_users',
            'manage_all_brands',
            'manage_all_outlets',
            'approve_brands',
            'approve_outlets',
            'view_all_analytics',
            'manage_platform_settings'
        ]
    };

    const permissions: Set<string> = new Set();

    if (activeRole) {
        const rolePerms = PLATFORM_PERMISSIONS[activeRole.role] || [];
        rolePerms.forEach((p: string) => permissions.add(p));
        
        if (activeRole.permissions) {
            activeRole.permissions.forEach((p: string) => permissions.add(p));
        }
    } else {
        user.roles.forEach(role => {
            const rolePerms = PLATFORM_PERMISSIONS[role.role] || [];
            rolePerms.forEach((p: string) => permissions.add(p));
            
            if (role.permissions) {
                role.permissions.forEach((p: string) => permissions.add(p));
            }
        });
    }

    return Array.from(permissions);
};
