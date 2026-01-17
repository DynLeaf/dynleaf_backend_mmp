import { Response } from 'express';

/**
 * Standard API response structure
 */
export interface ApiResponse<T = any> {
  status: boolean;
  data?: T | null;
  message?: string | null;
  error?: string | null;
  error_code?: string;
  errors?: Record<string, string>; // Validation errors
  timestamp?: string;
}

/**
 * Standard Error Codes
 * These match the frontend error handler expectations
 */
export enum ErrorCode {
  // Authentication
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  OTP_EXPIRED = 'OTP_EXPIRED',
  OTP_INVALID = 'OTP_INVALID',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  OTP_LIMIT_EXCEEDED = 'OTP_LIMIT_EXCEEDED',
  INVALID_TOKEN = 'INVALID_TOKEN',

  // Authorization
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  ACCOUNT_PENDING_APPROVAL = 'ACCOUNT_PENDING_APPROVAL',

  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Resources
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  OUTLET_NOT_FOUND = 'OUTLET_NOT_FOUND',
  MENU_ITEM_NOT_FOUND = 'MENU_ITEM_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  BRAND_NOT_FOUND = 'BRAND_NOT_FOUND',

  // Server
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  MAINTENANCE_MODE = 'MAINTENANCE_MODE',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

/**
 * Send a successful response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message: string | null = null,
  statusCode = 200
): Response {
  const body: ApiResponse<T> = {
    status: true,
    data,
    message: message || undefined,
  };
  return res.status(statusCode).json(body);
}

/**
 * Send a standardized error response
 * Supports both old and new signatures for backward compatibility
 */
export function sendError(
  res: Response,
  message: string,
  errorCodeOrError?: ErrorCode | string | unknown | null,
  statusCode: number = 500,
  validationErrors?: Record<string, string>
): Response {
  // Determine error code based on parameter type
  let errorCode: string = ErrorCode.INTERNAL_SERVER_ERROR;

  // If errorCodeOrError is a string and looks like an error code, use it
  if (typeof errorCodeOrError === 'string') {
    errorCode = errorCodeOrError;
  }
  // If it's null or undefined, use default
  // If it's an object or Error, ignore it (old behavior)

  const body: ApiResponse<null> = {
    status: false,
    data: null,
    message,
    error_code: errorCode,
    timestamp: new Date().toISOString(),
  };

  // Add validation errors if provided
  if (validationErrors && Object.keys(validationErrors).length > 0) {
    body.errors = validationErrors;
  }

  return res.status(statusCode).json(body);
}

/**
 * Send a validation error response (400)
 */
export function sendValidationError(
  res: Response,
  errors: Record<string, string>,
  message: string = 'Please check your input and try again.'
): Response {
  return sendError(res, message, ErrorCode.VALIDATION_ERROR, 400, errors);
}

/**
 * Send an authentication error response (401)
 */
export function sendAuthError(
  res: Response,
  errorCode: ErrorCode | string = ErrorCode.INVALID_CREDENTIALS,
  message: string = 'Authentication failed. Please try again.'
): Response {
  return sendError(res, message, errorCode, 401);
}

/**
 * Send an authorization error response (403)
 */
export function sendAuthorizationError(
  res: Response,
  errorCode: ErrorCode | string = ErrorCode.INSUFFICIENT_PERMISSIONS,
  message: string = 'You don\'t have permission to perform this action.'
): Response {
  return sendError(res, message, errorCode, 403);
}

/**
 * Send a not found error response (404)
 */
export function sendNotFoundError(
  res: Response,
  errorCode: ErrorCode | string = ErrorCode.RESOURCE_NOT_FOUND,
  message: string = 'The requested resource could not be found.'
): Response {
  return sendError(res, message, errorCode, 404);
}

/**
 * Send a rate limit error response (429)
 */
export function sendRateLimitError(
  res: Response,
  errorCode: ErrorCode | string = ErrorCode.RATE_LIMIT_EXCEEDED,
  message: string = 'Too many requests. Please try again later.'
): Response {
  return sendError(res, message, errorCode, 429);
}

/**
 * Send a server error response (500)
 */
export function sendServerError(
  res: Response,
  errorCode: ErrorCode | string = ErrorCode.INTERNAL_SERVER_ERROR,
  message: string = 'An unexpected error occurred. Our team has been notified.'
): Response {
  return sendError(res, message, errorCode, 500);
}

/**
 * Legacy sendError for backward compatibility
 * @deprecated Use specific error functions instead
 */
export function sendErrorLegacy(
  res: Response,
  message: string,
  error: unknown = null,
  statusCode = 500
): Response {
  let errorPayload: any = null;

  if (error instanceof Error) {
    errorPayload = error.message;
  } else if (typeof error === 'string') {
    errorPayload = error;
  } else if (error && typeof error === 'object') {
    errorPayload = error as Record<string, any>;
  }

  const body: ApiResponse<null> = {
    status: false,
    data: null,
    message: message,
    error: errorPayload || message,
  };

  return res.status(statusCode).json(body);
}

export default {
  sendSuccess,
  sendError,
  sendValidationError,
  sendAuthError,
  sendAuthorizationError,
  sendNotFoundError,
  sendRateLimitError,
  sendServerError,
  ErrorCode,
};
