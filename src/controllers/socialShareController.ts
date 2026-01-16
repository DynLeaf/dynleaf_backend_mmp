import { Request, Response } from 'express';
import { Outlet } from '../models/Outlet.js';
import { sendError } from '../utils/response.js';

/**
 * Serves a minimal HTML page with dynamic Open Graph and Twitter meta tags 
 * for better social media sharing previews. This is a "Meta Proxy" for SPAs.
 */
export const getSocialMeta = async (req: Request, res: Response) => {
    try {
        const { outletId } = req.params; // This will be userId if type is 'user'
        let { type } = req.query; // 'profile', 'menu', or 'user'

        // Auto-detect type from URL path if not provided
        if (!type) {
            const path = req.path || req.url;
            if (path.includes('/menu')) {
                type = 'menu';
            } else if (path.includes('/u/')) {
                type = 'user';
            } else {
                type = 'profile';
            }
        }

        let title = '';
        let description = '';
        let brandLogo = '/dynleaf-logo.svg';
        let brandName = 'DynLeaf';
        let pageUrlPath = '';

        if (type === 'user') {
            const { User } = await import('../models/User.js');
            const user = await User.findById(outletId);
            if (!user) return res.status(404).send('User not found');

            brandName = user.full_name || 'Food Explorer';
            brandLogo = user.avatar_url || '/user-profile-icon.avif';
            title = `${brandName}`;
            description = `Join ${brandName} and discover exceptional dining together!`;
            pageUrlPath = `/u/${outletId}`;
        } else {
            const outlet = await Outlet.findById(outletId).populate('brand_id');
            if (!outlet) return res.status(404).send('Outlet not found');

            const brand: any = outlet.brand_id;
            brandName = outlet.name || brand?.name || 'Restaurant';
            brandLogo = brand?.logo_url || '/dynleaf-logo.svg';

            title = type === 'menu'
                ? `${brandName} Menu`
                : `${brandName}`;

            description = type === 'menu'
                ? `View the menu for ${brandName}! Discover our delicious offerings.`
                : `Check out ${brandName}! Scan the QR code or visit the link to explore.`;

            pageUrlPath = `/restaurant/${outletId}${type === 'menu' ? '/menu' : ''}`;
        }

        // Generate full absolute URL for the image
        // In Azure SWA/production, we want to ensure we point to the absolute URL
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const baseUrl = `${protocol}://${host}`;

        const imageUrl = brandLogo.startsWith('http')
            ? brandLogo // Brand logo is better for share thumbnails usually
            : `${baseUrl}${brandLogo.startsWith('/') ? '' : '/'}${brandLogo}`;

        const pageUrl = `${baseUrl}${pageUrlPath}`;

        // Escape HTML special characters to prevent XSS
        const escapeHtml = (str: string) => {
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const safeTitle = escapeHtml(title);
        const safeDescription = escapeHtml(description);
        const safeBrandName = escapeHtml(brandName);

        // Minimal HTML template with meta tags
        // This is optimized for bots (WhatsApp, Facebook, Twitter, etc.)
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Primary Meta Tags -->
    <title>${safeTitle}</title>
    <meta name="title" content="${safeTitle}">
    <meta name="description" content="${safeDescription}">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:site_name" content="${safeBrandName}">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${pageUrl}">
    <meta property="twitter:title" content="${safeTitle}">
    <meta property="twitter:description" content="${safeDescription}">
    <meta property="twitter:image" content="${imageUrl}">

    <!-- Favicon -->
    <link rel="icon" href="${imageUrl}">

    <!-- Redirect to the real app for actual users -->
    <meta http-equiv="refresh" content="0;url=${pageUrl}">
    <script>
        window.location.href = "${pageUrl}";
    </script>
</head>
<body>
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px; max-width: 600px; margin: 0 auto;">
        <img src="${imageUrl}" alt="${safeBrandName}" style="width: 120px; height: 120px; border-radius: 20px; object-fit: cover; margin-bottom: 20px;">
        <h1 style="color: #1a1a1a; font-size: 28px; margin-bottom: 10px;">${safeTitle}</h1>
        <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">${safeDescription}</p>
        <p style="color: #999; font-size: 14px;">Redirecting you to the app...</p>
        <a href="${pageUrl}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #38ad00; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Click here if you are not redirected</a>
    </div>
</body>
</html>`.trim();

        // Set cache headers for better performance
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600'); // Cache for 5-10 minutes
        return res.send(html);
    } catch (error: any) {
        console.error('Social share meta error:', error);
        return res.status(500).send('Internal Server Error');
    }
};
