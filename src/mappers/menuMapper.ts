import { OutletMenuResponseDto, MenuCategoryResponseDto, FoodItemResponseDto } from '../dto/menu-management/menu-response.dto.js';
import { ComboResponseDto } from '../dto/menu-management/combo.dto.js';
import { BrandMapper } from './brandMapper.js';

export class MenuMapper {
  static toFoodItemResponseDto(item: any, userVoteType: string | null = null): FoodItemResponseDto {
    const images = Array.isArray(item.images)
      ? item.images.filter(Boolean)
      : (item.image_url ? [item.image_url] : []);

    return {
      _id: item._id.toString(),
      name: item.name,
      image_url: item.image_url || images[0] || null,
      images,
      item_type: item.item_type || 'food',
      food_type: item.food_type || 'veg',
      is_veg: item.is_veg,
      price: item.price,
      discount_percentage: item.discount_percentage || 0,
      is_available: item.is_available,
      stock_status: item.stock_status || 'in_stock',
      allergens: item.allergens || [],
      ingredients: item.ingredients || [],
      cuisines: item.cuisines || [],
      tags: item.tags || [],
      avg_rating: item.avg_rating || 0,
      total_votes: item.total_votes || 0,
      upvote_count: item.upvote_count || 0,
      downvote_count: item.downvote_count || 0,
      post_count: item.post_count || 0,
      order_count: item.order_count || 0,
      is_featured: item.is_featured || false,
      is_recommended: item.is_recommended || false,
      is_bestseller: item.is_bestseller || false,
      is_signature: item.is_signature || false,
      is_new: item.is_new || false,
      addons: item.addons || [],
      variants: item.variants || [],
      user_vote_type: userVoteType,
      price_display_type: item.price_display_type || 'fixed'
    };
  }

  static toComboResponseDto(combo: any): ComboResponseDto {
    return {
      _id: combo._id.toString(),
      id: combo._id.toString(),
      combo_type: combo.combo_type || 'offer',
      name: combo.name,
      slug: combo.slug,
      description: combo.description,
      image_url: combo.image_url,
      combo_price: combo.price,
      is_available: combo.is_active,
      avg_rating: combo.avg_rating,
      total_votes: combo.total_votes,
      order_count: combo.order_count,
      items: (combo.items || []).map((item: any) => ({
        food_item_id: item.food_item_id?._id || item.food_item_id,
        name: item.food_item_id?.name || 'Item',
        image_url: item.food_item_id?.image_url,
        food_type: item.food_item_id?.food_type,
        quantity: item.quantity,
        individual_price: item.food_item_id?.price || 0
      })).filter((i: any) => i.food_item_id), // Ensure it's valid
      original_price: combo.original_price,
      discount_percentage: combo.discount_percentage,
      food_type: combo.food_type
    };
  }

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
        category_id: cat._id?.toString() || cat.id?.toString(),
        category_name: cat.name,
        category_slug: cat.slug,
        category_image_url: cat.category_image_url || cat.image_url || cat.imageUrl || null,
        image_url: cat.image_url || cat.imageUrl || cat.category_image_url || null,
        display_order: cat.sortOrder || 0,
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
