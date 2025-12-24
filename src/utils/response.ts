import { Response } from 'express';

export interface ApiResponse<T = any> {
  status: boolean;
  data: T | null;
  message: string | null;
  error: string | Record<string, any> | null;
}

export function sendSuccess<T>(res: Response, data: T, message: string | null = null, statusCode = 200) {
  const body: ApiResponse<T> = {
    status: true,
    data,
    message,
    error: null
  };
  return res.status(statusCode).json(body);
}

export function sendError(res: Response, message: string, error: unknown = null, statusCode = 500) {
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
};
