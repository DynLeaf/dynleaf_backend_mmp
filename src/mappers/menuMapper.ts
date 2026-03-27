import { OutletMenuResponseDto, MenuCategoryResponseDto } from '../dto/menu-management/menu-response.dto.js';
import { BrandMapper } from './brandMapper.js';

export class MenuMapper {
  static toOutletMenuResponseDto(data: {
    outlet: any;
    brand: any;
    menu_settings: any;
    menu: any[];
    combos: any[];
    sub_menus: any[];
    total_items: number;
    isFollowing: boolean;
    followersCount: number;
  }): OutletMenuResponseDto {
    const { outlet, brand, menu_settings, menu, combos, sub_menus, total_items, isFollowing, followersCount } = data;
    
    return {
      outlet: {
        id: outlet._id.toString(),
        _id: outlet._id.toString(),
        name: outlet.name,
        brand: brand ? BrandMapper.toResponseDto(brand) : null,
        address: outlet.address,
        description: outlet.description || '',
        contact: outlet.contact,
        avg_rating: outlet.avg_rating,
        total_reviews: outlet.total_reviews,
        amenities: outlet.amenities || [],
        is_following: isFollowing,
        followers_count: followersCount,
        ordering_settings: outlet.ordering_settings
      },
      menu_settings: menu_settings,
      menu: menu.map(cat => ({
        id: cat._id?.toString() || cat.id?.toString(),
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        imageUrl: cat.imageUrl,
        sortOrder: cat.sortOrder || 0,
        items: cat.items || []
      })),
      combos: combos,
      sub_menus: sub_menus,
      sub_menu_active: outlet.multi_menu_settings?.has_sub_menus ?? false,
      ask_submenu_on_scan: outlet.multi_menu_settings?.ask_submenu_on_scan ?? false,
      total_items: total_items
    };
  }
}
