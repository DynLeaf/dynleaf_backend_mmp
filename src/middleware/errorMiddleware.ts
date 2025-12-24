import { NextFunction, Request, Response } from 'express';
import { sendError } from '../utils/response.js';

// Centralized Express error handler
export default function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Log full error on server for debugging
  // You can replace this with a structured logger (winston/pino) later
  console.error('Unhandled error:', err && err.stack ? err.stack : err);

  // If error has a statusCode, use it (our AppError will)
  const statusCode = err?.statusCode || 500;
  const message = err?.message || 'Internal Server Error';

  return sendError(res, message, err, statusCode);
}
