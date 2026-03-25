// Application error codes
export enum ErrorCode {
  // Authentication
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  OTP_EXPIRED = 'OTP_EXPIRED',
  OTP_INVALID = 'OTP_INVALID',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  OTP_LIMIT_EXCEEDED = 'OTP_LIMIT_EXCEEDED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_DEACTIVATED = 'ACCOUNT_DEACTIVATED',
  ACCESS_TOKEN_TOO_LARGE = 'ACCESS_TOKEN_TOO_LARGE',

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
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',

  // Server
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  MAINTENANCE_MODE = 'MAINTENANCE_MODE',
  GOOGLE_OAUTH_ERROR = 'GOOGLE_OAUTH_ERROR',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly isOperational: boolean;
  readonly errorCode: ErrorCode;

  constructor(
    message: string,
    statusCode = 400,
    errorCode: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, errorCode = ErrorCode.RESOURCE_NOT_FOUND) {
    super(`${resource} not found`, 404, errorCode);
  }
}

export class ValidationError extends AppError {
  readonly errors: Record<string, string>;

  constructor(
    message: string,
    errors: Record<string, string> = {},
    errorCode = ErrorCode.VALIDATION_ERROR
  ) {
    super(message, 400, errorCode);
    this.errors = errors;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed', errorCode = ErrorCode.INVALID_CREDENTIALS) {
    super(message, 401, errorCode);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions', errorCode = ErrorCode.INSUFFICIENT_PERMISSIONS) {
    super(message, 403, errorCode);
  }
}

export class RateLimitError extends AppError {
  readonly retryAfter?: number;

  constructor(message = 'Too many requests', retryAfter?: number) {
    super(message, 429, ErrorCode.RATE_LIMIT_EXCEEDED);
    this.retryAfter = retryAfter;
  }
}
