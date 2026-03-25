import { buildSocialMeta } from '../utils/socialMetaBuilder.js';
import * as userRepository from '../repositories/userRepository.js';
import * as outletRepository from '../repositories/outletRepository.js';
import { AppError } from '../errors/AppError.js';
import mongoose from 'mongoose';

export class SocialShareService {
  async generateMeta(
    entityId: string, 
    type: string | undefined, 
    source: string | undefined,
    protocol: string,
    host: string | undefined,
    forwardedHost: string | undefined
  ): Promise<string> {
    let title = '';
    let description = '';
    let brandLogo = '/dynleaf-logo.png';
    let brandName = 'DynLeaf';
    let pageUrlPath = '';

    const shareType = type || this.detectType(entityId);

    if (shareType === 'user') {
      const user = mongoose.Types.ObjectId.isValid(entityId)
        ? await userRepository.findById(entityId)
        : await userRepository.findByUsername(entityId);

      if (!user) throw new AppError('User profile not found', 404);

      brandName = user.full_name || 'Food Explorer';
      brandLogo = user.avatar_url || '/user-profile-icon.avif';
      title = `${brandName}`;
      description = `Join ${brandName} on DynLeaf and discover exceptional dining together!`;
      pageUrlPath = `/u/${user.username || user._id}`;
    } else {
      const outlet = await outletRepository.findBySlugOrId(entityId);
      if (!outlet) throw new AppError('Restaurant not found', 404);

      // Outlet model in this codebase seems to have brand_id populated or not
      // Legacy code used outlet.brand_id directly
      const brand = outlet.brand_id as any;
      brandName = outlet.name || brand?.name || 'Restaurant';
      brandLogo = brand?.logo_url || '/dynleaf-logo.png';

      title = shareType === 'menu' ? `${brandName} Menu` : `${brandName}`;
      description = shareType === 'menu'
        ? `View the menu for ${brandName}! Discover our delicious offerings.`
        : `Check out ${brandName}! Scan the QR code or visit the link to explore.`;

      const actualIdOrSlug = outlet.slug || outlet._id;
      pageUrlPath = `/restaurant/${actualIdOrSlug}${shareType === 'menu' ? '/menu' : ''}`;
    }

    const frontendBaseUrl = this.getFrontendBaseUrl(protocol, host, forwardedHost);
    const apiBaseUrl = `${protocol}://${forwardedHost || host}`;
    const imageUrl = brandLogo.startsWith('http')
      ? brandLogo
      : `${apiBaseUrl}${brandLogo.startsWith('/') ? '' : '/'}${brandLogo}`;

    const sourceParam = source ? `?source=${encodeURIComponent(source)}` : '';
    const pageUrl = `${frontendBaseUrl}${pageUrlPath}${sourceParam}`;

    return buildSocialMeta({
      title,
      description,
      imageUrl,
      url: pageUrl
    });
  }

  private detectType(path: string): string {
    if (path.includes('/menu')) return 'menu';
    if (path.includes('/u/')) return 'user';
    return 'profile';
  }

  private getFrontendBaseUrl(protocol: string, host: string | undefined, forwardedHost: string | undefined): string {
    const apiHost = forwardedHost || host || 'api.dynleaf.com';
    let frontendHost = apiHost;

    if (apiHost.includes('preview.api.dynleaf.com')) {
      frontendHost = 'preview.dynleaf.com';
    } else if (apiHost.includes('api.dynleaf.com')) {
      frontendHost = 'dynleaf.com';
    } else if (apiHost.includes('localhost') || apiHost.includes('127.0.0.1')) {
      frontendHost = 'localhost:5173';
    }

    return `${protocol}://${frontendHost}`;
  }
}

export const socialShareService = new SocialShareService();
