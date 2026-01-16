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
        const { type } = req.query; // 'profile', 'menu', or 'user'

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
            description = `Join ${brandName} on DynLeaf and discover exceptional dining together!`;
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

        // Map API domain to frontend domain for redirect
        // API: preview.api.dynleaf.com -> Frontend: preview.dynleaf.com
        // API: api.dynleaf.com -> Frontend: dynleaf.com
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const apiHost = req.headers['x-forwarded-host'] || req.get('host');

        // Determine the frontend host based on the API host
        let frontendHost = apiHost;
        if (apiHost?.includes('preview.api.dynleaf.com')) {
            frontendHost = 'preview.dynleaf.com';
        } else if (apiHost?.includes('api.dynleaf.com')) {
            frontendHost = 'dynleaf.com';
        } else if (apiHost?.includes('localhost') || apiHost?.includes('127.0.0.1')) {
            // For local development, assume frontend is on port 5173
            frontendHost = 'localhost:5173';
        }

        const apiBaseUrl = `${protocol}://${apiHost}`;
        const frontendBaseUrl = `${protocol}://${frontendHost}`;

        const imageUrl = brandLogo.startsWith('http')
            ? brandLogo
            : `${apiBaseUrl}${brandLogo.startsWith('/') ? '' : '/'}${brandLogo}`;

        const pageUrl = `${frontendBaseUrl}${pageUrlPath}`;

        // Minimal HTML template with meta tags
        // This is optimized for bots (WhatsApp, Facebook, Twitter, etc.)
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Primary Meta Tags -->
    <title>${title}</title>
    <meta name="title" content="${title}">
    <meta name="description" content="${description}">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:image:alt" content="${brandName} logo">
    <meta property="og:site_name" content="DynLeaf">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${pageUrl}">
    <meta property="twitter:title" content="${title}">
    <meta property="twitter:description" content="${description}">
    <meta property="twitter:image" content="${imageUrl}">

    <!-- Favicon -->
    <link rel="icon" href="${imageUrl}">

    <!-- Smart redirect: Only redirect real users, not bots/crawlers -->
    <script>
        // Detect if this is a bot/crawler
        var isBot = /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|twitter/i.test(navigator.userAgent);
        
        if (!isBot) {
            // Small delay to ensure meta tags are parsed
            setTimeout(function() {
                window.location.href = "${pageUrl}";
            }, 100);
        }
    </script>
</head>
<body>
    <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <img src="${imageUrl}" alt="${brandName}" style="width: 120px; height: 120px; border-radius: 20px;">
        <h1>${title}</h1>
        <p>${description}</p>
        <p>Redirecting you to the app...</p>
        <a href="${pageUrl}">Click here if you are not redirected</a>
    </div>
</body>
</html>`.trim();

        res.setHeader('Content-Type', 'text/html');
        return res.send(html);
    } catch (error: any) {
        console.error('Social share meta error:', error);
        return res.status(500).send('Internal Server Error');
    }
};
