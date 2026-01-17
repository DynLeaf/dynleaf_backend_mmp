/**
 * Example: Updated Auth Controller with Production-Level Error Handling
 * 
 * This file shows how to update the authController.ts to use the new
 * error handling system with proper error codes and user-friendly messages.
 */

import { Request, Response } from 'express';
import {
    sendSuccess,
    sendError,
    sendValidationError,
    sendAuthError,
    sendRateLimitError,
    ErrorCode
} from '../utils/response.js';

// ============================================================================
// EXAMPLE 1: Send OTP with Enhanced Error Handling
// ============================================================================

// ❌ BEFORE: Generic error messages
export const sendOtpBefore = async (req: Request, res: Response) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return sendError(res, "Phone number is required", null, 400);
        }

        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        if (!phoneRegex.test(phone)) {
            return sendError(res, "Invalid phone number format", null, 400);
        }

        const rateLimit = await otpService.checkRateLimit(phone);
        if (!rateLimit.allowed) {
            return sendError(res, "Too many OTP requests", { retryAfter: rateLimit.retryAfter }, 429);
        }

        const result = await otpService.sendOTP(phone);
        return sendSuccess(res, { expiresIn: result.expiresIn }, "OTP sent successfully");
    } catch (error: any) {
        console.error("Send OTP error:", error);
        return sendError(res, error.message);
    }
};

// ✅ AFTER: User-friendly error codes and messages
export const sendOtpAfter = async (req: Request, res: Response) => {
    try {
        const { phone } = req.body;

        // Validation errors with field-specific messages
        const validationErrors: Record<string, string> = {};

        if (!phone) {
            validationErrors.phone = 'Phone number is required';
        } else {
            const phoneRegex = /^\+?[1-9]\d{1,14}$/;
            if (!phoneRegex.test(phone)) {
                validationErrors.phone = 'Please enter a valid phone number';
            }
        }

        if (Object.keys(validationErrors).length > 0) {
            return sendValidationError(res, validationErrors);
        }

        // Rate limiting with specific error code
        const rateLimit = await otpService.checkRateLimit(phone);
        if (!rateLimit.allowed) {
            return sendRateLimitError(
                res,
                ErrorCode.OTP_LIMIT_EXCEEDED,
                'You\'ve requested too many verification codes. Please try again in a few minutes.'
            );
        }

        // Send OTP
        const result = await otpService.sendOTP(phone);
        return sendSuccess(
            res,
            { expiresIn: result.expiresIn },
            'Verification code sent successfully'
        );
    } catch (error: any) {
        console.error("Send OTP error:", error);
        return sendError(
            res,
            'Unable to send verification code. Please try again.',
            ErrorCode.INTERNAL_SERVER_ERROR,
            500
        );
    }
};

// ============================================================================
// EXAMPLE 2: Verify OTP with Enhanced Error Handling
// ============================================================================

// ❌ BEFORE: Generic error messages
export const verifyOtpBefore = async (req: Request, res: Response) => {
    try {
        const { phone, otp, deviceInfo } = req.body;

        if (!phone || !otp) {
            return sendError(res, "Phone and OTP are required", null, 400);
        }

        if (!deviceInfo || !deviceInfo.deviceId) {
            return sendError(res, "Device information is required", null, 400);
        }

        const isValid = await otpService.verifyOTP(phone, otp);

        if (!isValid) {
            return sendError(res, "Invalid OTP", null, 401);
        }

        // ... rest of the logic
    } catch (error: any) {
        console.error("Verify OTP error:", error);
        return sendError(res, error.message);
    }
};

// ✅ AFTER: Specific error codes for different scenarios
export const verifyOtpAfter = async (req: Request, res: Response) => {
    try {
        const { phone, otp, deviceInfo } = req.body;

        // Validation errors
        const validationErrors: Record<string, string> = {};

        if (!phone) {
            validationErrors.phone = 'Phone number is required';
        }

        if (!otp) {
            validationErrors.otp = 'Verification code is required';
        } else if (otp.length !== 6 || !/^\d+$/.test(otp)) {
            validationErrors.otp = 'Please enter a valid 6-digit code';
        }

        if (!deviceInfo || !deviceInfo.deviceId) {
            validationErrors.device = 'Device information is required';
        }

        if (Object.keys(validationErrors).length > 0) {
            return sendValidationError(res, validationErrors);
        }

        // Verify OTP with specific error handling
        const verificationResult = await otpService.verifyOTP(phone, otp);

        if (!verificationResult.valid) {
            // Check if OTP is expired
            if (verificationResult.expired) {
                return sendAuthError(
                    res,
                    ErrorCode.OTP_EXPIRED,
                    'Your verification code has expired. Please request a new one.'
                );
            }

            // Invalid OTP
            return sendAuthError(
                res,
                ErrorCode.OTP_INVALID,
                'The verification code you entered is incorrect. Please check and try again.'
            );
        }

        // ... rest of the authentication logic

        return sendSuccess(res, { user: userData }, 'Login successful');
    } catch (error: any) {
        console.error("Verify OTP error:", error);
        return sendError(
            res,
            'Unable to verify your code. Please try again.',
            ErrorCode.INTERNAL_SERVER_ERROR,
            500
        );
    }
};

// ============================================================================
// EXAMPLE 3: Refresh Token with Enhanced Error Handling
// ============================================================================

export const refreshTokenAfter = async (req: Request, res: Response) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            return sendAuthError(
                res,
                ErrorCode.SESSION_EXPIRED,
                'Your session has expired. Please log in again.'
            );
        }

        // Verify refresh token
        const decoded = tokenService.verifyRefreshToken(refreshToken);

        if (!decoded) {
            return sendAuthError(
                res,
                ErrorCode.INVALID_TOKEN,
                'Invalid session. Please log in again.'
            );
        }

        // Check if session exists
        const session = await sessionService.getSession(decoded.sessionId);

        if (!session) {
            return sendAuthError(
                res,
                ErrorCode.SESSION_EXPIRED,
                'Your session has expired. Please log in again.'
            );
        }

        // Generate new tokens
        const newAccessToken = tokenService.generateAccessToken(user, session._id);
        const newRefreshToken = tokenService.generateRefreshToken(user._id, session._id);

        // Update session
        await sessionService.rotateRefreshToken(session._id, newRefreshToken);

        // Set cookies
        res.cookie('accessToken', newAccessToken, cookieOptions);
        res.cookie('refreshToken', newRefreshToken, cookieOptions);

        return sendSuccess(res, null, 'Session refreshed successfully');
    } catch (error: any) {
        console.error("Refresh token error:", error);

        // Handle specific JWT errors
        if (error.name === 'TokenExpiredError') {
            return sendAuthError(
                res,
                ErrorCode.SESSION_EXPIRED,
                'Your session has expired. Please log in again.'
            );
        }

        if (error.name === 'JsonWebTokenError') {
            return sendAuthError(
                res,
                ErrorCode.INVALID_TOKEN,
                'Invalid session. Please log in again.'
            );
        }

        return sendError(
            res,
            'Unable to refresh session. Please log in again.',
            ErrorCode.INTERNAL_SERVER_ERROR,
            500
        );
    }
};

// ============================================================================
// EXAMPLE 4: Account Status Checks
// ============================================================================

export const checkAccountStatus = async (user: any, res: Response): Promise<Response | null> => {
    // Check if account is suspended
    if (user.is_suspended) {
        return sendAuthError(
            res,
            ErrorCode.INSUFFICIENT_PERMISSIONS,
            `Your account has been suspended. ${user.suspension_reason || 'Please contact support for more information.'}`
        );
    }

    // Check if account is temporarily locked
    if (user.locked_until && user.locked_until > new Date()) {
        const minutesLeft = Math.ceil((user.locked_until.getTime() - Date.now()) / 60000);
        return sendAuthError(
            res,
            ErrorCode.INSUFFICIENT_PERMISSIONS,
            `Your account is temporarily locked due to multiple failed login attempts. Please try again in ${minutesLeft} minutes.`
        );
    }

    // Check if account is pending approval
    if (user.status === 'pending_approval') {
        return sendAuthError(
            res,
            ErrorCode.ACCOUNT_PENDING_APPROVAL,
            'Your account is awaiting approval. You\'ll be notified once it\'s reviewed.'
        );
    }

    return null; // Account is OK
};

// ============================================================================
// EXAMPLE 5: Global Error Handler Middleware
// ============================================================================

export const errorHandler = (err: any, req: Request, res: Response, next: any) => {
    console.error('Unhandled Error:', err);

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const errors: Record<string, string> = {};
        Object.keys(err.errors).forEach(key => {
            errors[key] = err.errors[key].message;
        });
        return sendValidationError(res, errors);
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        const fieldName = field === 'phone' ? 'phone number' :
            field === 'email' ? 'email address' : field;
        return sendValidationError(res, {
            [field]: `This ${fieldName} is already registered`
        }, 'Account already exists');
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return sendAuthError(
            res,
            ErrorCode.INVALID_TOKEN,
            'Invalid authentication token. Please log in again.'
        );
    }

    if (err.name === 'TokenExpiredError') {
        return sendAuthError(
            res,
            ErrorCode.SESSION_EXPIRED,
            'Your session has expired. Please log in again.'
        );
    }

    // Default server error
    return sendError(
        res,
        'An unexpected error occurred. Our team has been notified and is working on it.',
        ErrorCode.INTERNAL_SERVER_ERROR,
        500
    );
};

// ============================================================================
// MIGRATION STEPS FOR authController.ts
// ============================================================================

/*
 * 1. Update imports:
 *    import { 
 *        sendSuccess, 
 *        sendError, 
 *        sendValidationError, 
 *        sendAuthError,
 *        sendRateLimitError,
 *        ErrorCode 
 *    } from '../utils/response.js';
 * 
 * 2. Replace validation errors:
 *    - Collect all validation errors in an object
 *    - Use sendValidationError(res, errors)
 * 
 * 3. Replace authentication errors:
 *    - Use sendAuthError(res, ErrorCode.OTP_INVALID, message)
 *    - Use specific error codes for different scenarios
 * 
 * 4. Replace rate limiting errors:
 *    - Use sendRateLimitError(res, ErrorCode.OTP_LIMIT_EXCEEDED, message)
 * 
 * 5. Update catch blocks:
 *    - Use sendError(res, message, ErrorCode.INTERNAL_SERVER_ERROR, 500)
 *    - Handle specific error types (JWT, Mongoose, etc.)
 * 
 * 6. Add error handler middleware:
 *    - Add to your Express app: app.use(errorHandler)
 */
