import { Request, Response } from 'express';
import { socialShareService } from '../services/socialShareService.js';

export const getSocialMeta = async (req: Request, res: Response) => {
  try {
    const { outletId } = req.params;
    const { type, source } = req.query as { type?: string; source?: string };
    
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = req.get('host');
    const forwardedHost = req.headers['x-forwarded-host'] as string;

    const html = await socialShareService.generateMeta(
      outletId,
      type,
      source,
      protocol,
      host,
      forwardedHost
    );

    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  } catch (error: any) {
    console.error('Social share meta error:', error);
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Unable to load share preview. Please try again later.';
    
    // Fallback minimal HTML for error case
    return res.status(statusCode).send(`
      <!DOCTYPE html>
      <html>
      <head><title>DynLeaf</title></head>
      <body><p>${message}</p></body>
      </html>
    `);
  }
};
