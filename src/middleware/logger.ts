import { Request, Response, NextFunction } from 'express';

// Simple request logger middleware
export default function logger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const time = new Date().toISOString();
    console.log(`[${time}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration} ms`);
  });

  next();
}
