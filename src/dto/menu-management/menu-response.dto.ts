import { FoodItemResponseDto } from './food-item.dto.js';

export { FoodItemResponseDto };
import { ComboResponseDto } from './combo.dto.js';

export interface MenuCategoryResponseDto {
  category_id: string;
  category_name: string;
  category_slug: string;
  category_image_url?: string | null;
  image_url?: string | null;
  display_order: number;
  items: FoodItemResponseDto[];
}

export interface OutletMenuResponseDto {
  outlet: {
    id: string;
    _id: string;
    name: string;
    brand: {
      id: string;
      _id: string;
      name: string;
      logo_url?: string;
      is_branded: boolean;
      brand_theme: {
        primary_color?: string;
        secondary_color?: string;
      } | null;
    } | null;
    address?: any;
    description?: string;
    contact?: {
      phone?: string;
      email?: string;
    };
    avg_rating?: number;
    total_reviews?: number;
    amenities?: string[];
    is_following: boolean;
    followers_count: number;
    ordering_settings?: {
      whatsapp_number?: string;
      enable_qr_ordering: boolean;
      enable_link_ordering: boolean;
    };
  };
  menu_settings?: any;
  menu: MenuCategoryResponseDto[];
  combos: ComboResponseDto[];
  sub_menus: any[];
  sub_menu_active: boolean;
  ask_submenu_on_scan: boolean;
  total_items: number;
}
