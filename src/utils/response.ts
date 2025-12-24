import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string | Record<string, any> | null;
}

export function sendSuccess<T>(res: Response, data: T, message?: string, status = 200) {
  const body: ApiResponse<T> = { success: true, data, message };
  return res.status(status).json(body);
}

export function sendError(res: Response, error: unknown, message?: string, status = 500) {
  let errorMessage: string | undefined = message;
  let errorPayload: any = null;

  if (error instanceof Error) {
    errorMessage = errorMessage || error.message;
  } else if (typeof error === 'string') {
    errorMessage = errorMessage || error;
  } else if (error && typeof error === 'object') {
    errorPayload = error as Record<string, any>;
  }

  const body: ApiResponse = {
    success: false,
    message: errorMessage,
    error: errorPayload || errorMessage || null,
  };

  return res.status(status).json(body);
}

export default {
  sendSuccess,
  sendError,
};
